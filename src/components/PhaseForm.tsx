import { useState } from "react";
import type { FieldDef } from "@/lib/simulation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PhaseFormProps {
  fields: FieldDef[];
  initial?: Record<string, string | number>;
  submitting?: boolean;
  submitted?: boolean;
  onSubmit: (values: Record<string, string | number>) => void;
}

export function PhaseForm({ fields, initial, submitting, submitted, onSubmit }: PhaseFormProps) {
  const [values, setValues] = useState<Record<string, string | number>>(() => {
    const init: Record<string, string | number> = {};
    for (const f of fields) {
      init[f.key] = initial?.[f.key] ?? (f.type === "number" ? 0 : "");
    }
    return init;
  });

  const handleChange = (key: string, raw: string, type: "text" | "number") => {
    setValues((v) => ({ ...v, [key]: type === "number" ? Number(raw) : raw }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="space-y-5"
    >
      {fields.map((f) => (
        <div key={f.key} className="space-y-2">
          <Label htmlFor={f.key} className="text-sm font-medium">
            {f.label}
            {f.suffix && <span className="ml-2 text-xs text-muted-foreground">({f.suffix})</span>}
          </Label>
          <Input
            id={f.key}
            type={f.type}
            placeholder={f.placeholder}
            min={f.min}
            max={f.max}
            step={f.step}
            value={values[f.key] as string | number}
            disabled={submitted || submitting}
            onChange={(e) => handleChange(f.key, e.target.value, f.type)}
            className="h-11 text-base"
            required
          />
        </div>
      ))}
      <Button
        type="submit"
        size="lg"
        variant={submitted ? "success" : "hero"}
        className="w-full"
        disabled={submitted || submitting}
      >
        {submitted
          ? "✓ Submitted — waiting for class"
          : submitting
            ? "Submitting…"
            : "Submit answer"}
      </Button>
    </form>
  );
}
