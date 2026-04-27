import { useState } from "react";
import type { FieldDef } from "@/lib/simulation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
      if (f.type !== "display") {
        init[f.key] = initial?.[f.key] ?? (f.type === "number" ? 0 : "");
      }
    }
    return init;
  });

  const handleChange = (key: string, value: string | number) => {
    setValues((v) => ({ ...v, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="space-y-5"
    >
      {fields.map((f) => {
        const label = f.label
          .replace("<<B>>", String(initial?.B ?? "B"))
          .replace("<<phase3freq>>", String(values["freq"] || "<frequency>"));
        return (
          <div key={f.key} className="space-y-2">
            {f.type === "display" ? (
              <p className="text-sm text-muted-foreground">{label}</p>
            ) : (
              <>
                <Label htmlFor={f.key} className="text-sm font-medium">
                  {label}
                  {f.suffix && <span className="ml-2 text-xs text-muted-foreground">({f.suffix})</span>}
                </Label>
                {f.type === "select" ? (
                  <Select
                    value={values[f.key] as string}
                    onValueChange={(value) => handleChange(f.key, value)}
                    disabled={submitted || submitting}
                  >
                    <SelectTrigger className="h-11 text-base">
                      <SelectValue placeholder={f.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {f.options?.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={f.key}
                    type={f.type}
                    placeholder={f.placeholder}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    value={values[f.key] as string | number}
                    disabled={submitted || submitting}
                    onChange={(e) => handleChange(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                    className="h-11 text-base"
                    required
                  />
                )}
              </>
            )}
          </div>
        )
      })}
      <Button
        type="submit"
        size="lg"
        variant={submitted ? "success" : "hero"}
        className="w-full"
        disabled={submitted || submitting}
      >
        {submitted
          ? "✓ Submitted - waiting for class"
          : submitting
            ? "Submitting…"
            : "Submit answer"}
      </Button>
    </form>
  );
}
