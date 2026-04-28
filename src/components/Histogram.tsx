// Lightweight numeric histogram + text frequency visualization.

interface NumericProps {
  values: number[];
  suffix?: string;
}

export function NumericHistogram({ values, suffix = "" }: NumericProps) {
  if (values.length === 0) {
    return <p className="text-sm text-muted-foreground">No responses yet.</p>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const bins = 8;
  const step = range / bins;
  const buckets = Array.from({ length: bins }, () => 0);

  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor((value - min) / step));
    buckets[index]++;
  }

  const peak = Math.max(...buckets);
  const formatValue = (value: number) => (Number.isInteger(value) ? value.toString() : value.toFixed(1));
  const tickValues = Array.from(new Set([
    peak,
    Math.ceil((2 * peak) / 3),
    Math.ceil(peak / 3),
    0,
  ])).sort((a, b) => b - a);

  return (
    <div className="space-y-3 overflow-x-auto">
      <div className="flex gap-4">
        <div className="flex flex-col justify-between h-40 text-[10px] text-muted-foreground">
          {tickValues.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="flex-1">
          <div className="flex h-40 border-l border-muted/50">
            {buckets.map((count, index) => {
              const heightPct = peak > 0 ? (count / peak) * 100 : 0;
              const bucketMin = min + index * step;
              const bucketMax = bucketMin + step;
              return (
                <div key={index} className="flex-1 h-full">
                  <div className="flex h-full flex-col justify-end">
                    <div
                      className="mx-auto w-full rounded-t-md bg-[image:var(--gradient-hero)] transition-all hover:opacity-80"
                      style={{ height: `${heightPct}%`, minHeight: count > 0 ? 6 : 0 }}
                      title={`${count} responses · ${formatValue(bucketMin)}–${formatValue(bucketMax)}${suffix ? ` ${suffix}` : ""}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{formatValue(min)}</span>
            <span>{formatValue(max)}</span>
          </div>
        </div>
      </div>
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
