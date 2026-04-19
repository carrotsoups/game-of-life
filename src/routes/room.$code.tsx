import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  computePlan,
  checkAnswer,
  formatCurrency,
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

  const meta = PHASE_META[phase];
  const inputP = inputPhaseForLabel(phase);
  const alreadySubmitted = inputP ? submittedPhases.has(inputP) : false;

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
}: {
  phase: number;
  inputP: 1 | 3 | 5 | null;
  alreadySubmitted: boolean;
  onSubmit: (v: Record<string, string | number>) => void;
  assignment: Assignment | null;
  roomId: string | null;
  participantId: string;
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
      <CalculationCard
        plan={assignment.assigned_plan}
        correct={assignment.correct_value}
        roomId={roomId}
        participantId={participantId}
      />
    );
  }

  if (phase === PHASES.FINISHED && assignment) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-2xl font-bold">🎉 Class finished!</h2>
        <p className="mt-2 text-muted-foreground">Your assigned plan ended at:</p>
        <p className="mt-3 bg-[image:var(--gradient-hero)] bg-clip-text text-4xl font-bold text-transparent">
          {formatCurrency(assignment.correct_value)}
        </p>
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
          title="Early career (18→50)"
          rows={[
            ["Monthly invest", `$${plan.phase1.monthly}/mo`],
            ["Return", `${plan.phase1.rate}%/yr`],
          ]}
        />
        <Section
          title="Hold (50→65)"
          rows={[
            ["Vehicle", plan.phase2.vehicle],
            ["Return", `${plan.phase2.rate}%/yr`],
            ["Extra", `$${plan.phase2.extra}/mo`],
          ]}
        />
        <Section
          title="Retirement (65→80)"
          rows={[
            ["Lifestyle", plan.phase3.lifestyle],
            ["Withdraw", `$${plan.phase3.withdraw}/mo`],
            ["Return", `${plan.phase3.rate}%/yr`],
          ]}
        />
      </div>
      <div className="border-t bg-muted/40 p-4 text-center text-xs text-muted-foreground">
        Get ready — when the calculation phase begins you'll need to compute the final balance at
        age 80.
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

function CalculationCard({
  plan,
  correct,
  roomId,
  participantId,
}: {
  plan: LifePlan;
  correct: number;
  roomId: string | null;
  participantId: string;
}) {
  const [guess, setGuess] = useState<string>("");
  const [feedback, setFeedback] = useState<"high" | "low" | "correct" | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [busy, setBusy] = useState(false);
  const trueAnswer = useMemo(() => correct, [correct]);

  // Hint: also show the user how it would compute (without showing the answer)
  const verifyOwn = computePlan(plan); // sanity for dev

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) return;
    const v = Number(guess);
    if (!Number.isFinite(v)) return toast.error("Enter a number");
    setBusy(true);
    const result = checkAnswer(v, trueAnswer);
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setFeedback(result);

    // Upsert final_submissions
    const { error } = await supabase.from("final_submissions").upsert(
      {
        participant_id: participantId,
        room_id: roomId,
        user_value: v,
        is_correct: result === "correct",
        attempts: newAttempts,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "participant_id" },
    );
    setBusy(false);
    if (error) toast.error("Could not submit");
  };

  return (
    <Card className="p-8">
      <h2 className="text-xl font-semibold">Compute the final balance at age 80</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use compound interest across all three phases of your shuffled life. Within 0.1% counts as
        correct.
      </p>

      <details className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Formula reminder</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Phase 1: monthly contributions for 25 years compounding at the early-career rate</li>
          <li>
            Phase 2: that lump sum holds for 15 years (+ optional extra contributions) at the hold
            rate
          </li>
          <li>
            Phase 3: withdraw monthly for 15 years while remaining balance still earns the
            retirement rate
          </li>
        </ul>
      </details>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <Label htmlFor="g">Your final balance ($)</Label>
        <Input
          id="g"
          type="number"
          step="0.01"
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          className="h-12 text-lg"
          required
          disabled={feedback === "correct"}
        />
        <Button
          type="submit"
          variant={feedback === "correct" ? "success" : "hero"}
          size="lg"
          className="w-full"
          disabled={busy || feedback === "correct"}
        >
          {feedback === "correct" ? "✓ Locked in" : busy ? "Checking…" : "Check answer"}
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
            ? `🎯 Correct! ${formatCurrency(trueAnswer)}`
            : feedback === "high"
              ? "📈 Too high — try lower"
              : "📉 Too low — try higher"}
          <div className="mt-1 text-xs opacity-70">Attempt #{attempts}</div>
        </div>
      )}

      {/* Hidden in production: show plan pre-calc check; harmless for now */}
      {import.meta.env.DEV && (
        <p className="mt-6 text-xs text-muted-foreground">
          dev-only target: {formatCurrency(verifyOwn)}
        </p>
      )}
    </Card>
  );
}
