// Simulation domain logic: prompts, schemas, calculation, shuffling.

export const PHASES = {
  LOBBY: 0,
  PHASE_1: 1,
  PHASE_1_RESULTS: 2,
  PHASE_2: 3,
  PHASE_2_RESULTS: 4,
  PHASE_3: 5,
  PHASE_3_RESULTS: 6,
  ASSIGNMENT: 7,
  CALCULATION: 8,
  FINISHED: 9,
} as const;

export type PhaseValue = (typeof PHASES)[keyof typeof PHASES];

export const PHASE_META: Record<
  number,
  {
    title: string;
    subtitle: string;
    kind: "lobby" | "input" | "results" | "assignment" | "calc" | "done";
  }
> = {
  0: { title: "Lobby", subtitle: "Waiting for everyone to join", kind: "lobby" },
  1: { title: "Phase 1 — Early Career", subtitle: "Ages 18–25 → 40–50", kind: "input" },
  2: { title: "Phase 1 — Class Distribution", subtitle: "Ages 18–25 → 40–50", kind: "results" },
  3: { title: "Phase 2 — Mid Life Hold", subtitle: "Ages 40–50 → 60–65", kind: "input" },
  4: { title: "Phase 2 — Class Distribution", subtitle: "Ages 40–50 → 60–65", kind: "results" },
  5: { title: "Phase 3 — Retirement Stage", subtitle: "Ages 60–65 → 80", kind: "input" },
  6: { title: "Phase 3 — Class Distribution", subtitle: "Ages 60–65 → 80", kind: "results" },
  7: {
    title: "Your Shuffled Life Plan",
    subtitle: "A randomized destiny awaits",
    kind: "assignment",
  },
  8: { title: "Calculate Your Outcome", subtitle: "Compute the final value", kind: "calc" },
  9: { title: "Class Reveal", subtitle: "How did everyone fare?", kind: "done" },
};

// Per-phase form definitions
export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export const PHASE_1_FIELDS: FieldDef[] = [
  {
    key: "occupation",
    label: "Your occupation",
    type: "text",
    placeholder: "e.g. Software engineer",
  },
  { key: "city", label: "City you live in", type: "text", placeholder: "e.g. Lisbon" },
  {
    key: "monthly",
    label: "Monthly investment",
    type: "number",
    min: 0,
    max: 100000,
    step: 50,
    suffix: "$/mo",
  },
  {
    key: "rate",
    label: "Expected annual return",
    type: "number",
    min: 0,
    max: 30,
    step: 0.1,
    suffix: "%/yr",
  },
];

export const PHASE_2_FIELDS: FieldDef[] = [
  {
    key: "vehicle",
    label: "What you hold savings in",
    type: "text",
    placeholder: "e.g. Index funds",
  },
  {
    key: "rate",
    label: "Expected annual return while holding",
    type: "number",
    min: 0,
    max: 25,
    step: 0.1,
    suffix: "%/yr",
  },
  {
    key: "extra",
    label: "Extra contribution (optional)",
    type: "number",
    min: 0,
    max: 100000,
    step: 50,
    suffix: "$/mo",
  },
];

export const PHASE_3_FIELDS: FieldDef[] = [
  {
    key: "lifestyle",
    label: "Retirement lifestyle",
    type: "text",
    placeholder: "e.g. Travel a lot",
  },
  {
    key: "withdraw",
    label: "Monthly withdrawal",
    type: "number",
    min: 0,
    max: 100000,
    step: 100,
    suffix: "$/mo",
  },
  {
    key: "rate",
    label: "Conservative return on remaining",
    type: "number",
    min: 0,
    max: 15,
    step: 0.1,
    suffix: "%/yr",
  },
];

export function fieldsForPhase(inputPhase: number): FieldDef[] {
  if (inputPhase === 1) return PHASE_1_FIELDS;
  if (inputPhase === 3) return PHASE_2_FIELDS;
  if (inputPhase === 5) return PHASE_3_FIELDS;
  return [];
}

export function inputPhaseForLabel(p: number): 1 | 3 | 5 | null {
  if (p === 1) return 1;
  if (p === 3) return 3;
  if (p === 5) return 5;
  return null;
}

// === Calculation ===
// Phase 1: monthly contributions for 25 years (25→50) growing at rate1
// Phase 2: hold for 15 years (50→65) growing at rate2 + optional extra contributions
// Phase 3: 15 years of withdrawals (65→80) on remaining balance growing at rate3
// Returns the remaining nest egg at age 80 (could be negative if over-withdrawn).

export interface LifePlan {
  phase1: { occupation: string; city: string; monthly: number; rate: number };
  phase2: { vehicle: string; rate: number; extra: number };
  phase3: { lifestyle: string; withdraw: number; rate: number };
}

const YEARS_P1 = 25;
const YEARS_P2 = 15;
const YEARS_P3 = 15;

function fvAnnuity(monthly: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return monthly * ((Math.pow(1 + r, n) - 1) / r);
}

function fvLump(principal: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  return principal * Math.pow(1 + r, n);
}

export function computePlan(plan: LifePlan): number {
  const p1End = fvAnnuity(plan.phase1.monthly, plan.phase1.rate, YEARS_P1);
  const p2End =
    fvLump(p1End, plan.phase2.rate, YEARS_P2) +
    fvAnnuity(plan.phase2.extra, plan.phase2.rate, YEARS_P2);

  // Phase 3: each month we earn return then withdraw
  const r3 = plan.phase3.rate / 100 / 12;
  const n3 = YEARS_P3 * 12;
  let balance = p2End;
  for (let i = 0; i < n3; i++) {
    balance = balance * (1 + r3) - plan.phase3.withdraw;
  }
  return balance;
}

export function checkAnswer(user: number, correct: number): "high" | "low" | "correct" {
  if (correct === 0) {
    if (Math.abs(user) < 1) return "correct";
    return user > correct ? "high" : "low";
  }
  const err = Math.abs(user - correct) / Math.abs(correct);
  if (err <= 0.001) return "correct";
  return user > correct ? "high" : "low";
}

// === Shuffle: derangement-ish to avoid self-assignments ===
// We assemble each plan from one student's phase1 + another's phase2 + another's phase3,
// ensuring no field source is the student themselves whenever possible.
export interface ParticipantAnswers {
  participantId: string;
  phase1?: LifePlan["phase1"];
  phase2?: LifePlan["phase2"];
  phase3?: LifePlan["phase3"];
}

function shuffledIndices(n: number, seed: number, forbidden: number): number[] {
  // Simple Fisher–Yates seeded shuffle then ensure index !== forbidden if possible
  const arr = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildAssignments(
  answers: ParticipantAnswers[],
): { participantId: string; plan: LifePlan }[] {
  const n = answers.length;
  if (n === 0) return [];

  const pickFor = (selfIdx: number, slotSeed: number) => {
    const order = shuffledIndices(n, selfIdx * 31 + slotSeed * 7 + 1, selfIdx);
    // Prefer first non-self with the data; if only self has data fall back to self
    for (const idx of order) {
      if (idx !== selfIdx) return idx;
    }
    return order[0];
  };

  return answers.map((self, i) => {
    const p1Idx = pickFor(i, 1);
    const p2Idx = pickFor(i, 2);
    const p3Idx = pickFor(i, 3);
    const plan: LifePlan = {
      phase1: answers[p1Idx].phase1 ??
        self.phase1 ?? { occupation: "—", city: "—", monthly: 0, rate: 0 },
      phase2: answers[p2Idx].phase2 ?? self.phase2 ?? { vehicle: "—", rate: 0, extra: 0 },
      phase3: answers[p3Idx].phase3 ?? self.phase3 ?? { lifestyle: "—", withdraw: 0, rate: 0 },
    };
    return { participantId: self.participantId, plan };
  });
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no easily confused chars
  let out = "";
  for (let i = 0; i < 5; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
