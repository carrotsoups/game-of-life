// Lightweight numeric histogram + text frequency visualization.

interface NumericProps {
  values: number[];
  bins?: number;
  suffix?: string;
}

export function NumericHistogram({ values, bins = 8, suffix = "" }: NumericProps) {
  if (values.length === 0) {
    return <p className="text-sm text-muted-foreground">No responses yet.</p>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = range / bins;
  const buckets = Array.from({ length: bins }, () => 0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / step));
    buckets[idx]++;
  }
  const peak = Math.max(...buckets);

  return (
    <div className="flex h-40 items-end gap-1.5">
      {buckets.map((count, i) => {
        const lo = min + i * step;
        const hi = lo + step;
        const heightPct = peak > 0 ? (count / peak) * 100 : 0;
        return (
          <div key={i} className="group flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t-md bg-[image:var(--gradient-hero)] transition-all hover:opacity-80"
              style={{ height: `${heightPct}%`, minHeight: count > 0 ? 4 : 0 }}
              title={`${count} responses · ${lo.toFixed(1)}–${hi.toFixed(1)}${suffix}`}
            />
            <span className="text-[10px] text-muted-foreground">{Math.round(lo)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function TextFrequency({ values, max = 12 }: { values: string[]; max?: number }) {
  if (values.length === 0) {
    return <p className="text-sm text-muted-foreground">No responses yet.</p>;
  }
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = v.trim().toLowerCase();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
  const peak = sorted[0]?.[1] ?? 1;
  return (
    <div className="space-y-2">
      {sorted.map(([word, count]) => (
        <div key={word} className="flex items-center gap-3">
          <span className="w-32 truncate text-sm font-medium capitalize">{word}</span>
          <div className="flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-[image:var(--gradient-warm)]"
              style={{ width: `${(count / peak) * 100}%` }}
            />
          </div>
          <span className="w-6 text-right text-sm text-muted-foreground">{count}</span>
        </div>
      ))}
    </div>
  );
}
