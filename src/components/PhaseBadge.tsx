import { PHASE_META } from "@/lib/simulation";

export function PhaseBadge({ phase }: { phase: number }) {
  const meta = PHASE_META[phase] ?? { title: "—", subtitle: "" };
  return (
    <div className="inline-flex flex-col items-start gap-0.5 rounded-full bg-card px-4 py-1.5 shadow-[var(--shadow-soft)] ring-1 ring-border">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Phase {phase}
      </span>
      <span className="text-sm font-semibold text-foreground">{meta.title}</span>
    </div>
  );
}
