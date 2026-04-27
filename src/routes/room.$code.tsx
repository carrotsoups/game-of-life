import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhaseBadge } from "@/components/PhaseBadge";
import { PhaseForm } from "@/components/PhaseForm";
import {
  PHASES,
  PHASE_META,
  fieldsForPhase,
  inputPhaseForLabel,
  computePhase1,
  computePhase2,
  computePhase3,
  checkAnswer,
  formatCurrency,
  makeLifePlanWordProblem,
  type LifePlan,
} from "@/lib/simulation";
import { getRoomSession, setRoomSession } from "@/lib/session";
import { toast } from "sonner";

export const Route = createFileRoute("/room/$code")({
  head: ({ params }) => ({
    meta: [{ title: `Room ${params.code} · Classroom Life Simulation` }],
  }),
  component: StudentRoom,
});

interface Assignment {
  assigned_plan: LifePlan;
  correct_value: number;
}

function StudentRoom() {
  const { code } = Route.useParams();
  const session = getRoomSession(code);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [phase, setPhase] = useState<number>(0);
  const [participantId, setParticipantId] = useState<string | null>(session?.participantId ?? null);
  const [name, setName] = useState(session?.name ?? "");
  const [joining, setJoining] = useState(false);
  const [submittedPhases, setSubmittedPhases] = useState<Set<number>>(new Set());
  const [assignment, setAssignment] = useState<Assignment | null>(null);

  // Bootstrap room
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: room } = await supabase
        .from("rooms")
        .select("id, phase")
        .eq("code", code)
        .maybeSingle();
      if (!room || cancelled) return;
      setRoomId(room.id);
      setPhase(room.phase);
      if (participantId) {
        const { data: rs } = await supabase
          .from("responses")
          .select("phase")
          .eq("participant_id", participantId);
        if (!cancelled) setSubmittedPhases(new Set((rs ?? []).map((r) => r.phase)));
        const { data: a } = await supabase
          .from("assignments")
          .select("assigned_plan, correct_value")
          .eq("participant_id", participantId)
          .maybeSingle();
        if (!cancelled && a)
          setAssignment({
            assigned_plan: a.assigned_plan as unknown as LifePlan,
            correct_value: a.correct_value ?? 0,
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, participantId]);

  // Subscribe to room phase + my assignment
  useEffect(() => {
    if (!roomId) return;
    const ch = supabase
      .channel(`student-${roomId}-${participantId ?? "anon"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as { phase?: number };
          if (typeof row.phase === "number") setPhase(row.phase);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "assignments", filter: `room_id=eq.${roomId}` },
        async () => {
          if (!participantId) return;
          const { data: a } = await supabase
            .from("assignments")
            .select("assigned_plan, correct_value")
            .eq("participant_id", participantId)
            .maybeSingle();
          if (a)
            setAssignment({
              assigned_plan: a.assigned_plan as unknown as LifePlan,
              correct_value: a.correct_value ?? 0,
            });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, participantId]);

  useEffect(() => {
    if (phase === PHASES.LOBBY) {
      setSubmittedPhases(new Set());
      setAssignment(null);
    }
  }, [phase]);

  const meta = PHASE_META[phase];
  const inputP = inputPhaseForLabel(phase);
  const alreadySubmitted = inputP ? submittedPhases.has(inputP) : false;
  const [calcSubmittingPhase, setCalcSubmittingPhase] = useState<number | null>(null);

  const getCalculationTarget = (phase: number) => {
    if (!assignment) return 0;
    if (phase === 10) return computePhase1(assignment.assigned_plan);
    if (phase === 11) return computePhase2(assignment.assigned_plan);
    return computePhase3(assignment.assigned_plan);
  };

  const handleSubmitCalculationPhase = async (phase: number, value: number) => {
    if (!roomId || !participantId || !assignment) return null;
    const correct = getCalculationTarget(phase);
    setCalcSubmittingPhase(phase);
    const result = checkAnswer(value, correct);

    const { error } = await supabase.from("responses").upsert(
      {
        room_id: roomId,
        participant_id: participantId,
        phase,
        answer: { value },
      },
      { onConflict: "participant_id,phase" },
    );

    setCalcSubmittingPhase(null);
    if (error) {
      toast.error("Could not submit");
      return null;
    }

    if (result === "correct") {
      setSubmittedPhases((s) => new Set(s).add(phase));
    }
    return result;
  };

  const handleJoinExisting = async () => {
    if (!roomId) return;
    if (!name.trim()) return toast.error("Enter your name");
    setJoining(true);
    const { data, error } = await supabase
      .from("participants")
      .insert({ room_id: roomId, name: name.trim(), role: "student" })
      .select()
      .single();
    setJoining(false);
    if (error) {
      if (error.code === "23505") return toast.error("That name is already taken");
      toast.error("Could not join");
      return;
    }
    setParticipantId(data.id);
    setRoomSession(code, { participantId: data.id, name: name.trim(), role: "student" });
  };

  const handleSubmitPhase = async (values: Record<string, string | number>) => {
    if (!roomId || !participantId || !inputP) return;
    const { error } = await supabase
      .from("responses")
      .insert({ room_id: roomId, participant_id: participantId, phase: inputP, answer: values });
    if (error) {
      toast.error("Could not submit");
      return;
    }
    setSubmittedPhases((s) => new Set(s).add(inputP));
    toast.success("Submitted!");
  };

  // Not joined yet → mini join form
  if (!participantId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-12">
        <Card className="w-full p-8 shadow-[var(--shadow-elegant)]">
          <h1 className="text-2xl font-bold">Join room {code}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick a name to use in this classroom</p>
          <div className="mt-6 space-y-3">
            <Label htmlFor="n">Your name</Label>
            <Input id="n" value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
            <Button
              variant="hero"
              size="lg"
              className="w-full"
              onClick={handleJoinExisting}
              disabled={joining}
            >
              Join
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Home
        </Link>
        <PhaseBadge phase={phase} />
      </div>

      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">{meta?.title}</h1>
        <p className="mt-1 text-muted-foreground">{meta?.subtitle}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Joined as <span className="font-semibold text-foreground">{name}</span>
        </p>
      </header>

      <StudentBody
        phase={phase}
        inputP={inputP}
        alreadySubmitted={alreadySubmitted}
        onSubmit={handleSubmitPhase}
        assignment={assignment}
        roomId={roomId}
        participantId={participantId}
        submittedPhases={submittedPhases}
        calcSubmittingPhase={calcSubmittingPhase}
        handleSubmitCalculationPhase={handleSubmitCalculationPhase}
      />
    </main>
  );
}

function StudentBody({
  phase,
  inputP,
  alreadySubmitted,
  onSubmit,
  assignment,
  roomId,
  participantId,
  submittedPhases,
  calcSubmittingPhase,
  handleSubmitCalculationPhase,
}: {
  phase: number;
  inputP: 1 | 3 | 5 | null;
  alreadySubmitted: boolean;
  onSubmit: (v: Record<string, string | number>) => void;
  assignment: Assignment | null;
  roomId: string | null;
  participantId: string;
  submittedPhases: Set<number>;
  calcSubmittingPhase: number | null;
  handleSubmitCalculationPhase: (phase: number, value: number) => Promise<"high" | "low" | "correct" | null>;
}) {
  if (phase === PHASES.LOBBY) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-pulse-glow rounded-full bg-[image:var(--gradient-hero)]" />
        <h2 className="text-lg font-semibold">You're in!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Waiting for your teacher to start the simulation…
        </p>
      </Card>
    );
  }

  if (inputP) {
    const fields = fieldsForPhase(inputP);
    return (
      <Card className="p-8">
        <PhaseForm fields={fields} submitted={alreadySubmitted} onSubmit={onSubmit} />
      </Card>
    );
  }

  if (
    phase === PHASES.PHASE_1_RESULTS ||
    phase === PHASES.PHASE_2_RESULTS ||
    phase === PHASES.PHASE_3_RESULTS
  ) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold">Look at the class screen 👀</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your teacher is showing the class distribution for this phase.
        </p>
      </Card>
    );
  }

  if (phase === PHASES.ASSIGNMENT && assignment) {
    return <AssignmentCard plan={assignment.assigned_plan} />;
  }

  if (phase === PHASES.ASSIGNMENT && !assignment) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Waiting for your shuffled life plan…</p>
      </Card>
    );
  }

  if (phase === PHASES.CALCULATION) {
    if (!assignment) {
      return (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No assignment found.</p>
        </Card>
      );
    }
    return (
      <CalculationStage
        plan={assignment.assigned_plan}
        submittedPhases={submittedPhases}
        submittingPhase={calcSubmittingPhase}
        onSubmitPhase={handleSubmitCalculationPhase}
      />
    );
  }

  if (phase === PHASES.FINISHED && assignment) {
    const phase1Result = computePhase1(assignment.assigned_plan);
    const phase2Result = computePhase2(assignment.assigned_plan);
    const phase3Result = computePhase3(assignment.assigned_plan);

    return (
      <Card className="p-8">
        <h2 className="text-center text-2xl font-bold">🎉 Class finished!</h2>
        <p className="mt-2 text-center text-muted-foreground">Your assigned plan results:</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Phase 1
            </h3>
            <p className="bg-[image:var(--gradient-hero)] bg-clip-text text-2xl font-bold text-transparent">
              {formatCurrency(phase1Result)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Early career</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Phase 2
            </h3>
            <p className="bg-[image:var(--gradient-hero)] bg-clip-text text-2xl font-bold text-transparent">
              {formatCurrency(phase2Result)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Hold</p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Phase 3
            </h3>
            <p className="bg-[image:var(--gradient-hero)] bg-clip-text text-2xl font-bold text-transparent">
              {formatCurrency(phase3Result)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Retirement</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-8 text-center">
      <p className="text-sm text-muted-foreground">
        Hang tight — your teacher is moving things along.
      </p>
    </Card>
  );
}

function AssignmentCard({ plan }: { plan: LifePlan }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-[image:var(--gradient-hero)] p-6 text-primary-foreground">
        <h2 className="text-sm font-medium uppercase tracking-wider opacity-90">
          Your shuffled life
        </h2>
        <p className="mt-1 text-2xl font-bold">{plan.phase1.occupation}</p>
        <p className="text-sm opacity-90">living in {plan.phase1.city}</p>
      </div>
      <div className="grid gap-4 p-6 sm:grid-cols-3">
        <Section
          title="Early career"
          rows={[
            ["Invest", `$${plan.phase1.amount} ${plan.phase1.freq}`],
            ["From → to", `${plan.phase1.A} → ${plan.phase1.B}`],
            ["Return", `${plan.phase1.rate}%/yr`],
          ]}
        />
        <Section
          title="Hold"
          rows={[
            ["Vehicle", plan.phase2.vehicle],
            ["Until age", `${plan.phase2.C}`],
            ["Return", `${plan.phase2.rate}%/yr`],
          ]}
        />
        <Section
          title="Retirement"
          rows={[
            ["Location", plan.phase3.location],
            ["Work as", plan.phase3.occupation],
            ["Withdraw age", `${plan.phase3.D}`],
          ]}
        />
      </div>
      <div className="border-t bg-muted/40 p-4 text-center text-xs text-muted-foreground">
        You'll need to calculate how much money you end up with at the end of each phase.
      </div>
    </Card>
  );
}

function Section({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="space-y-1 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CalculationStage({
  plan,
  submittedPhases,
  submittingPhase,
  onSubmitPhase,
}: {
  plan: LifePlan;
  submittedPhases: Set<number>;
  submittingPhase: number | null;
  onSubmitPhase: (phase: number, value: number) => Promise<"high" | "low" | "correct" | null>;
}) {
  const cards = [
    {
      phase: 10,
      title: "Phase 1 outcome",
      description: "Estimate the balance after the early-career investment stage.",
      label: "Phase 1 balance",
    },
    {
      phase: 11,
      title: "Phase 2 outcome",
      description: "Estimate the balance after the mid-life holding stage.",
      label: "Phase 2 balance",
    },
    {
      phase: 12,
      title: "Phase 3 outcome",
      description: "Estimate the withdrawal amount during retirement.",
      label: "Phase 3 payout",
    },
  ];

  const downloadWordProblem = () => {
    const text = makeLifePlanWordProblem(plan);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "life-plan-word-problem.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button variant="outline" size="sm" onClick={downloadWordProblem}>
          Download word problem
        </Button>
      </div>
      {cards.map((card) => (
        <CalculationPhaseCard
          key={card.phase}
          phase={card.phase}
          title={card.title}
          description={card.description}
          label={card.label}
          plan={plan}
          submitted={submittedPhases.has(card.phase)}
          submitting={submittingPhase === card.phase}
          onSubmit={onSubmitPhase}
        />
      ))}
    </div>
  );
}

function CalculationPhaseCard({
  phase,
  title,
  description,
  label,
  plan,
  submitted,
  submitting,
  onSubmit,
}: {
  phase: number;
  title: string;
  description: string;
  label: string;
  plan: LifePlan;
  submitted: boolean;
  submitting: boolean;
  onSubmit: (phase: number, value: number) => Promise<"high" | "low" | "correct" | null>;
}) {
  const [guess, setGuess] = useState<string>("");
  const [feedback, setFeedback] = useState<"high" | "low" | "correct" | null>(null);
  const [attempts, setAttempts] = useState(0);

  const target =
    phase === 10
      ? computePhase1(plan)
      : phase === 11
        ? computePhase2(plan)
        : computePhase3(plan);

  const isLocked = feedback === "correct";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const value = Number(guess);
    if (!Number.isFinite(value)) return toast.error("Enter a number");
    const result = await onSubmit(phase, value);
    if (!result) return;
    setAttempts((count) => count + 1);
    setFeedback(result);
    if (result !== "correct") {
      setGuess("");
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {process.env.NODE_ENV === "development" && (
          <p className="mt-2 text-xs font-mono text-muted-foreground">
            dev: target = {formatCurrency(target)}
          </p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Label htmlFor={`guess-${phase}`}>{label} ($)</Label>
        <Input
          id={`guess-${phase}`}
          type="number"
          step="0.01"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          className="h-12 text-lg"
          required
          disabled={isLocked || submitting}
        />
        <Button
          type="submit"
          variant={isLocked ? "success" : "hero"}
          size="lg"
          className="w-full"
          disabled={isLocked || submitting}
        >
          {isLocked ? "✓ Submitted" : submitting ? "Submitting…" : "Submit guess"}
        </Button>
      </form>

      {feedback && (
        <div
          className={`mt-4 rounded-lg p-4 text-center text-sm font-medium ${
            feedback === "correct"
              ? "bg-success/15 [color:oklch(0.35_0.12_145)]"
              : feedback === "high"
                ? "bg-warning/20 [color:oklch(0.35_0.12_60)]"
                : "bg-accent/15 [color:oklch(0.35_0.15_30)]"
          }`}
        >
          {feedback === "correct"
            ? "🎯 Correct"
            : feedback === "high"
              ? "📈 Too high - try lower"
              : "📉 Too low - try higher"}
          <div className="mt-1 text-xs opacity-70">Attempt #{attempts}</div>
        </div>
      )}
    </Card>
  );
}

