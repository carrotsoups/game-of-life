import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PhaseBadge } from "@/components/PhaseBadge";
import { NumericHistogram, TextFrequency } from "@/components/Histogram";
import {
  PHASES,
  PHASE_META,
  fieldsForPhase,
  inputPhaseForLabel,
  buildAssignments,
  computePhase1,
  computePhase2,
  computePhase3,
  checkAnswer,
  formatCurrency,
  makeLifePlanWordProblem,
  type LifePlan,
  type ParticipantAnswers,
} from "@/lib/simulation";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher/$code")({
  head: ({ params }) => ({
    meta: [{ title: `Teacher · Room ${params.code}` }],
  }),
  component: TeacherDashboard,
});

interface Participant {
  id: string;
  name: string;
  role: string;
}

interface ResponseRow {
  participant_id: string;
  phase: number;
  answer: Record<string, unknown>;
}

function TeacherDashboard() {
  const { code } = Route.useParams();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [phase, setPhase] = useState<number>(0);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [assignments, setAssignments] = useState<{
    participant_id: string;
    assigned_plan: unknown;
    correct_value: number | null;
  }[]>([]);
  const [working, setWorking] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const kickStudent = async (participantId: string, name: string) => {
    if (!roomId) return;
    setWorking(true);

    // Remove participant and all their data
    const { error: participantError } = await supabase
      .from("participants")
      .delete()
      .eq("id", participantId);

    if (participantError) {
      setWorking(false);
      toast.error("Could not remove student");
      return;
    }

    // Clean up responses and assignments
    await Promise.all([
      supabase.from("responses").delete().eq("participant_id", participantId),
      supabase.from("assignments").delete().eq("participant_id", participantId),
    ]);

    setWorking(false);
    toast.success(`Removed ${name} from the room`);
  };

  // Initial fetch + realtime subscriptions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: room, error } = await supabase
        .from("rooms")
        .select("id, phase")
        .eq("code", code)
        .maybeSingle();
      if (error || !room) {
        toast.error("Room not found");
        return;
      }
      if (cancelled) return;
      setRoomId(room.id);
      setPhase(room.phase);

      const [{ data: pData }, { data: rData }, { data: aData }] = await Promise.all([
        supabase.from("participants").select("id, name, role").eq("room_id", room.id),
        supabase.from("responses").select("participant_id, phase, answer").eq("room_id", room.id),
        supabase
          .from("assignments")
          .select("participant_id, assigned_plan, correct_value")
          .eq("room_id", room.id),
      ]);
      if (cancelled) return;
      setParticipants((pData ?? []) as Participant[]);
      setResponses((rData ?? []) as ResponseRow[]);
      setAssignments((aData ?? []) as {
        participant_id: string;
        assigned_plan: unknown;
        correct_value: number | null;
      }[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`teacher-${roomId}`)
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
        { event: "*", schema: "public", table: "participants", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("participants")
            .select("id, name, role")
            .eq("room_id", roomId);
          setParticipants((data ?? []) as Participant[]);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "responses", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("responses")
            .select("participant_id, phase, answer")
            .eq("room_id", roomId);
          setResponses((data ?? []) as ResponseRow[]);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "assignments", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("assignments")
            .select("participant_id, assigned_plan, correct_value")
            .eq("room_id", roomId);
          setAssignments((data ?? []) as {
            participant_id: string;
            assigned_plan: unknown;
            correct_value: number | null;
          }[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const students = useMemo(() => participants.filter((p) => p.role === "student"), [participants]);

  const downloadAllLifeCards = () => {
    if (assignments.length === 0) return;
    const chunks = assignments.map((assignmentRow, index) => {
      const student = participants.find((p) => p.id === assignmentRow.participant_id);
      const plan = assignmentRow.assigned_plan as LifePlan;
      return [
        `Student: ${student?.name ?? assignmentRow.participant_id}`,
        "----------------------------------------",
        makeLifePlanWordProblem(plan),
        "",
        "\n\nANSWERS:",
        `Phase 1: ${formatCurrency(computePhase1(plan))}`,
        `Phase 2: ${formatCurrency(computePhase2(plan))}`,
        `Phase 3: ${formatCurrency(computePhase3(plan))}`,
      ].join("\n");
    });
    const text = [
      `Life cards for room ${code}`,
      "",
      chunks.join("\n\n"),
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "life-cards.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const advance = async (toPhase: number) => {
    if (!roomId) return;
    setWorking(true);
    try {
      // When resetting to lobby, clear all student responses and assignments
      if (toPhase === PHASES.LOBBY) {
        const { error: deleteResponsesError } = await supabase
          .from("responses")
          .delete()
          .eq("room_id", roomId);
        if (deleteResponsesError) throw deleteResponsesError;
        const { error: deleteAssignmentsError } = await supabase
          .from("assignments")
          .delete()
          .eq("room_id", roomId);
        if (deleteAssignmentsError) throw deleteAssignmentsError;
        setResponses([]);
      }
      const status = toPhase >= PHASES.FINISHED ? "finished" : toPhase === 0 ? "waiting" : "active";
      const { error } = await supabase
        .from("rooms")
        .update({ phase: toPhase, status })
        .eq("id", roomId);
      if (error) throw error;
      if (toPhase === PHASES.LOBBY) {
        toast.success("Room reset to lobby");
      }
    } catch (e) {
      console.error(e);
      toast.error("Could not advance");
    } finally {
      setWorking(false);
    }
  };

  // When moving into ASSIGNMENT phase, build & store assignments
  const buildAndAssign = async () => {
    if (!roomId) return;
    setWorking(true);
    try {
      const answers: ParticipantAnswers[] = students.map((s) => {
        const r1 = responses.find((r) => r.participant_id === s.id && r.phase === 1)?.answer as
          | LifePlan["phase1"]
          | undefined;
        const r2 = responses.find((r) => r.participant_id === s.id && r.phase === 3)?.answer as
          | LifePlan["phase2"]
          | undefined;
        const r3 = responses.find((r) => r.participant_id === s.id && r.phase === 5)?.answer as
          | LifePlan["phase3"]
          | undefined;
        return { participantId: s.id, phase1: r1, phase2: r2, phase3: r3 };
      });
      if (answers.length === 0) {
        toast.error("No students have submitted answers");
        setWorking(false);
        return;
      }
      const assignments = buildAssignments(answers);
      type AssignmentInsert = {
        participant_id: string;
        room_id: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assigned_plan: any;
        correct_value: number;
      };
      const rows: AssignmentInsert[] = assignments.map((a) => ({
        participant_id: a.participantId,
        room_id: roomId,
        assigned_plan: a.plan,
        correct_value: computePhase3(a.plan),
      }));
      // Wipe & insert (in case re-shuffled)
      const { error: deleteError } = await supabase.from("assignments").delete().eq("room_id", roomId);
      if (deleteError) throw deleteError;
      const { error: insertError } = await supabase.from("assignments").insert(rows);
      if (insertError) throw insertError;
      await advance(PHASES.ASSIGNMENT);
      toast.success("Life plans shuffled and distributed!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to shuffle assignments");
    } finally {
      setWorking(false);
    }
  };

  const meta = PHASE_META[phase];
  const inputP = inputPhaseForLabel(phase);

  // Aggregate for results phases
  const resultsForPhase = (p: 1 | 3 | 5) => {
    const fields = fieldsForPhase(p);
    return fields.map((f) => {
      const values = responses
        .filter((r) => r.phase === p)
        .map((r) => (r.answer as Record<string, unknown>)[f.key]);
      return { field: f, values };
    });
  };

  const renderResults = (p: 1 | 3 | 5) => (
    <div className="grid gap-6 md:grid-cols-2">
      {resultsForPhase(p).map(({ field, values }) => (
        <Card key={field.key} className="p-6">
          <h3 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted-foreground">
            {field.label}
          </h3>
          {field.type === "number" ? (
            <NumericHistogram
              values={values.filter((v): v is number => typeof v === "number")}
              suffix={field.suffix}
            />
          ) : (
            <TextFrequency values={values.filter((v): v is string => typeof v === "string")} />
          )}
        </Card>
      ))}
    </div>
  );

  // Determine next-button label/action
  const renderControls = () => {
    if (phase === PHASES.LOBBY) {
      return (
        <Button
          variant="hero"
          size="lg"
          onClick={() => advance(PHASES.PHASE_1)}
          disabled={working || students.length === 0}
        >
          Start Simulation →
        </Button>
      );
    }
    if (phase === PHASES.PHASE_1) {
      return (
        <Button
          variant="hero"
          size="lg"
          onClick={() => advance(PHASES.PHASE_1_RESULTS)}
          disabled={working}
        >
          Show Class Results
        </Button>
      );
    }
    if (phase === PHASES.PHASE_1_RESULTS) {
      return (
        <Button variant="hero" size="lg" onClick={() => advance(PHASES.PHASE_2)} disabled={working}>
          Continue to Phase 2
        </Button>
      );
    }
    if (phase === PHASES.PHASE_2) {
      return (
        <Button
          variant="hero"
          size="lg"
          onClick={() => advance(PHASES.PHASE_2_RESULTS)}
          disabled={working}
        >
          Show Class Results
        </Button>
      );
    }
    if (phase === PHASES.PHASE_2_RESULTS) {
      return (
        <Button variant="hero" size="lg" onClick={() => advance(PHASES.PHASE_3)} disabled={working}>
          Continue to Phase 3
        </Button>
      );
    }
    if (phase === PHASES.PHASE_3) {
      return (
        <Button
          variant="hero"
          size="lg"
          onClick={() => advance(PHASES.PHASE_3_RESULTS)}
          disabled={working}
        >
          Show Class Results
        </Button>
      );
    }
    if (phase === PHASES.PHASE_3_RESULTS) {
      return (
        <Button variant="warm" size="lg" onClick={buildAndAssign} disabled={working}>
          🎲 Shuffle & assign life plans
        </Button>
      );
    }
    if (phase === PHASES.ASSIGNMENT) {
      return (
        <Button
          variant="hero"
          size="lg"
          onClick={() => advance(PHASES.CALCULATION)}
          disabled={working}
        >
          Begin calculation phase
        </Button>
      );
    }
    if (phase === PHASES.CALCULATION) {
      return (
        <Button
          variant="success"
          size="lg"
          onClick={() => advance(PHASES.FINISHED)}
          disabled={working}
        >
          Finish & Reveal class
        </Button>
      );
    }
    return (
      <Link to="/">
        <Button variant="outline" size="lg">
          ← Back to home
        </Button>
      </Link>
    );
  };

  // Counts for input phases
  const countSubmitted = (p: number) => responses.filter((r) => r.phase === p).length;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Home
          </Link>
          <PhaseBadge phase={phase} />
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-card px-4 py-2 shadow-[var(--shadow-soft)] ring-1 ring-border">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Room code</span>
            <div className="font-mono text-2xl font-bold tracking-[0.3em]">{code}</div>
          </div>
          <Button
            variant={devMode ? "destructive" : "outline"}
            size="sm"
            onClick={() => setDevMode(!devMode)}
          >
            {devMode ? "🔓 Dev Mode ON" : "🔒 Dev Mode OFF"}
          </Button>
        </div>
      </div>

      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight">{meta?.title}</h1>
        <p className="mt-1 text-muted-foreground">{meta?.subtitle}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="space-y-6">
          <Card className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Teacher controls</h2>
              <span className="text-sm text-muted-foreground">
                {students.length} student{students.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {renderControls()}
              {assignments.length > 0 && phase >= PHASES.ASSIGNMENT && (
                <Button variant="outline" size="lg" onClick={downloadAllLifeCards} disabled={working}>
                  Download all life cards
                </Button>
              )}
            </div>
          </Card>

          {inputP && (
            <Card className="p-6">
              <h2 className="mb-2 text-lg font-semibold">Live submissions</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {countSubmitted(inputP)} / {students.length} have submitted
              </p>
              <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[image:var(--gradient-success)] transition-[width] duration-500"
                  style={{
                    width: `${students.length === 0 ? 0 : (countSubmitted(inputP) / students.length) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {students.map((s) => {
                  const done = responses.some(
                    (r) => r.participant_id === s.id && r.phase === inputP,
                  );
                  return (
                    <span
                      key={s.id}
                      className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                        done
                          ? "bg-success/15 text-success-foreground ring-success/30 [color:oklch(0.4_0.12_145)]"
                          : "bg-muted text-muted-foreground ring-border"
                      }`}
                    >
                      {done ? "✓ " : ""}
                      {s.name}
                    </span>
                  );
                })}
              </div>
            </Card>
          )}

          {meta?.kind === "results" &&
            renderResults((phase === 2 ? 1 : phase === 4 ? 3 : 5) as 1 | 3 | 5)}

          {phase === PHASES.ASSIGNMENT && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold">Plans distributed</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Each student now sees a randomly shuffled life plan on their device.
              </p>
            </Card>
          )}

          {phase === PHASES.CALCULATION && (
            <CalculationLeaderboard roomId={roomId} students={students} responses={responses} devMode={devMode} />
          )}

          {phase === PHASES.FINISHED && (
            <CalculationLeaderboard roomId={roomId} students={students} responses={responses} reveal devMode={devMode} />
          )}
        </section>

        <aside>
          <Card className="p-6">
            <h2 className="mb-3 text-lg font-semibold">Participants</h2>
            {phase === PHASES.LOBBY && participants.some(p => p.role === "student") && (
              <p className="mb-3 text-xs text-muted-foreground">
                Click student names to remove them from the room
              </p>
            )}
            <ul className="space-y-2">
              {participants.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span
                    className={`h-2 w-2 rounded-full ${p.role === "teacher" ? "bg-accent" : "bg-success"}`}
                  />
                  {p.role === "student" && phase === PHASES.LOBBY ? (
                    <button
                      onClick={() => kickStudent(p.id, p.name)}
                      disabled={working}
                      className="font-medium text-destructive hover:text-destructive/80 hover:underline disabled:opacity-50"
                      title={`Click to remove ${p.name} from the room`}
                    >
                      {p.name}
                    </button>
                  ) : (
                    <span className="font-medium">{p.name}</span>
                  )}
                  {p.role === "teacher" && (
                    <span className="ml-auto text-xs uppercase text-muted-foreground">teacher</span>
                  )}
                </li>
              ))}
              {participants.length === 0 && (
                <li className="text-sm text-muted-foreground">Waiting for join…</li>
              )}
            </ul>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function CalculationLeaderboard({
  roomId,
  students,
  responses,
  reveal,
  devMode,
}: {
  roomId: string | null;
  students: Participant[];
  responses: ResponseRow[];
  reveal?: boolean;
  devMode?: boolean;
}) {
  const [subs, setSubs] = useState<
    { participant_id: string; user_value: number; is_correct: boolean; attempts: number }[]
  >([]);
  const [assignments, setAssignments] = useState<
    { participant_id: string; assigned_plan: unknown; correct_value: number | null }[]
  >([]);

  useEffect(() => {
    if (!roomId) return;
    const refresh = async () => {
      const [{ data: s }, { data: a }] = await Promise.all([
        supabase
          .from("final_submissions")
          .select("participant_id, user_value, is_correct, attempts")
          .eq("room_id", roomId),
        supabase
          .from("assignments")
          .select("participant_id, assigned_plan, correct_value")
          .eq("room_id", roomId),
      ]);
      setSubs((s ?? []) as typeof subs);
      setAssignments((a ?? []) as typeof assignments);
    };
    refresh();
    const ch = supabase
      .channel(`teacher-final-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "final_submissions",
          filter: `room_id=eq.${roomId}`,
        },
        refresh,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId]);

  const getTarget = (plan: LifePlan, phase: number) => {
    if (phase === 10) return computePhase1(plan);
    if (phase === 11) return computePhase2(plan);
    return computePhase3(plan);
  };

  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold">
        {reveal ? "Final results" : "Live calculation progress"}
      </h2>
      <ul className="space-y-4">
        {students.map((s) => {
          const sub = subs.find((x) => x.participant_id === s.id);
          const a = assignments.find((x) => x.participant_id === s.id);
          const progressCount = new Set(
            responses
              .filter((r) => r.participant_id === s.id && [10, 11, 12].includes(r.phase))
              .filter((r) => {
                if (!a || typeof a.assigned_plan !== "object" || a.assigned_plan === null) return false;
                const plan = a.assigned_plan as LifePlan;
                const value = Number((r.answer as Record<string, unknown>).value);
                if (!Number.isFinite(value)) return false;
                return checkAnswer(value, getTarget(plan, r.phase)) === "correct";
              })
              .map((r) => r.phase),
          ).size;
          return (
            <li key={s.id} className="rounded-lg bg-muted/50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {progressCount} / 3 correct guesses
                  </div>
                </div>
                <div className="text-right">
                  {sub?.is_correct ? (
                    <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold [color:oklch(0.4_0.12_145)]">
                      ✓ correct
                    </span>
                  ) : sub ? (
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(sub.user_value)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">…working</span>
                  )}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[image:var(--gradient-success)]"
                  style={{ width: `${(progressCount / 3) * 100}%` }}
                />
              </div>
              {reveal && a && a.correct_value !== null && (
                <div className="mt-2 text-xs text-muted-foreground">
                  target {formatCurrency(a.correct_value)}
                </div>
              )}
              {devMode && !reveal && a && typeof a.assigned_plan === "object" && a.assigned_plan !== null && (
                <div className="mt-2 space-y-1 text-xs text-orange-600 dark:text-orange-400">
                  <div>Phase 1: {formatCurrency(computePhase1(a.assigned_plan as LifePlan))}</div>
                  <div>Phase 2: {formatCurrency(computePhase2(a.assigned_plan as LifePlan))}</div>
                  <div>Phase 3: {formatCurrency(computePhase3(a.assigned_plan as LifePlan))}</div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
