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
  1: { title: "Phase 1 - Early Career", subtitle: "Your fish is making big bucks dropshipping shoes! How much extra income are you setting aside? Business isn't always lucrative...", kind: "input" },
  2: { title: "Phase 1 - Class Distribution", subtitle: "How much did your peers save", kind: "results" },
  3: { title: "Phase 2 - Life Crisis", subtitle: "Your fish went into debt buying shoes. Unfortunately, you cosigned! Fortunately, you make enough to cover the payments, just not enough to invest more", kind: "input" },
  4: { title: "Phase 2 - Class Distribution", subtitle: "How long is your fish in debt...", kind: "results" },
  5: { title: "Phase 3 - Retirement", subtitle: "Your fish got really good at gambling! No more shoe purchases!", kind: "input" },
  6: { title: "Phase 3 - Class Distribution", subtitle: "are you doomed", kind: "results" },
  7: {
    title: "Your Shuffled Life Plan",
    subtitle: "Possessed someone else's fish. How will you fare now?",
    kind: "assignment",
  },
  8: { title: "Calculate Your Outcome", subtitle: "Compute the monetary outcome after investing, holding, and retiring", kind: "calc" },
  9: { title: "Class Reveal", subtitle: "How did everyone fare?", kind: "done" },
};

// Per-phase form definitions
export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "display";
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  options?: string[];
}

export const PHASE_1_FIELDS: FieldDef[] = [
  {
    key: "occupation",
    label: "You are a...",
    type: "text",
    placeholder: "professionally unemployed",
  },
  { key: "city", 
    label: "living in...", 
    type: "text", 
    placeholder: "your parent's basement"
  },
  {
    key: "A",
    label: "investing from age...",
    type: "number",
    min: 18,
    max: 25,
    step: 1,
    suffix: "18-25 years old",
  },
  {
    key: "B",
    label: "to age...",
    type: "number",
    min: 40,
    max: 50,
    step: 1,
    suffix: "40-50 years old",
  },
  {
    key: "amount",
    label: "investing $...",
    type: "number",
    min: 50,
    max: 1000,
    step: 0.01,
    suffix: "$50-1000",
  },
  {
    key: "freq",
    label: "per...",
    type: "select",
    options: ["month", "year", "semiannual", "week", "biweek", "quarter"],
  },
  {
    key: "rate",
    label: "at ...% compounded per annum",
    type: "number",
    min: 2,
    max: 12,
    step: 0.01,
    suffix: "2-12%/yr",
  },
];

export const PHASE_2_FIELDS: FieldDef[] = [
  {
    key: "vehicle",
    label: "You hold these savings in...",
    type: "text",
    placeholder: "pokemon cards",
  },
  {
    key: "C",
    label: "from age <<B>> to ...",
    type: "number",
    min: 60,
    max: 65,
    step: 1,
    suffix: "60-65 years old",
  },
  {
    key: "rate",
    label: "at ...% compounded per annum",
    type: "number",
    min: 2,
    max: 12,
    step: 0.01,
    suffix: "2-12 %/yr",
  },
];

export const PHASE_3_FIELDS: FieldDef[] = [
  {
    key: "location",
    label: "You retire to...",
    type: "text",
    placeholder: "your uncle's couch",
  },
  {
    key: "occupation",
    label: "and work as a part-time...",
    type: "text",
    placeholder: "cheesemonger",
  },
  {
    key: "rate",
    label: "At this time, your remaining savings grow at ...%",
    type: "number",
    min: 2,
    max: 8,
    step: 0.1,
    suffix: "2-8%/yr",
  },
  {
    key: "freq",
    label: "compounded per...",
    type: "select",
    options: ["month", "year", "semiannual", "week", "biweek", "quarter"],
  },
  {
    key: "withdraw",
    label: "and get paid out every <<phase3freq>>",
    type: "display",
  },
  {
    key: "D",
    label: "Your fish put all on red and won! You have fully withdrawn your money by age...",
    type: "number",
    min: 80,
    max: 100,
    step: 1,
    suffix: "80-100 years old",
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
// Phase 1: month contributions for 25 years (25→50) growing at rate1
// Phase 2: hold for 15 years (50→65) growing at rate2 + optional extra contributions
// Phase 3: 15 years of withdrawals (65→80) on remaining balance growing at rate3
// Returns the remaining nest egg at age 80 (could be negative if over-withdrawn).

export interface LifePlan {
  phase1: { occupation: string; city: string; A:number, B:number; amount: number; freq: string; rate: number };
  phase2: { vehicle: string; C: number; rate: number };
  phase3: { location: string; occupation: string; rate: number; freq: string; withdraw: number, D: number };
}

const YEARS_P1 = 25;
const YEARS_P2 = 15;
const YEARS_P3 = 15;

function futureValue(amount: number, interestRate: number, years: number, freqS: string, ): number {
  const freqMap: Record<string, number> = {
    month: 12,
    year: 1,
    semiannual: 2,
    week: 52,
    biweek: 26,
    quarter: 4,
  };
  const freq = freqMap[freqS];
  const i = interestRate / 100 / freq;
  const n = years * freq;
  if (i === 0) return amount * n;
  return amount * ((Math.pow(1 + i, n) - 1) / i);
}

function fvLump(principal: number, interestRate: number, years: number, freqS: string): number {
  const freqMap: Record<string, number> = {
    month: 12,
    year: 1,
    semiannual: 2,
    week: 52,
    biweek: 26,
    quarter: 4,
  };
  const freq = freqMap[freqS];
  const i = interestRate / 100 / freq;
  const n = years * freq;
  if (i === 0) return principal * n;
  return principal * Math.pow(1 + i, n);
}

function payout(presentvalue: number, interestRate: number, years: number, freqS: string): number {
  const freqMap: Record<string, number> = {
    month: 12,
    year: 1,
    semiannual: 2,
    week: 52,
    biweek: 26,
    quarter: 4,
  };
  const freq = freqMap[freqS];
  const i = interestRate / 100 / freq;
  const n = years * freq;
  if (i === 0) return presentvalue / n;
  return presentvalue * i / (1 - Math.pow(1 + i, -n));
}

export function computePhase1(plan: LifePlan): number {
  const balance = futureValue(plan.phase1.amount, plan.phase1.rate, plan.phase1.B - plan.phase1.A, plan.phase1.freq);
  return balance;
}

export function computePhase2(plan: LifePlan): number {
  const balance = futureValue(plan.phase1.amount, plan.phase1.rate, plan.phase1.B - plan.phase1.A, plan.phase1.freq);
  const balance2 = fvLump(balance, plan.phase2.rate, plan.phase2.C-plan.phase1.B, "year");
  return balance2;
}

export function computePhase3(plan: LifePlan): number {
  const payoutPerPeriod = payout(computePhase2(plan), plan.phase3.rate, plan.phase3.D-plan.phase2.C, plan.phase3.freq);
  return payoutPerPeriod;
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
  // Simple Fisher-Yates seeded shuffle then ensure index !== forbidden if possible
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

  const defaultPhase1: LifePlan["phase1"] = {
    occupation: "--",
    city: "--",
    A: 18,
    B: 40,
    amount: 0,
    freq: "year",
    rate: 0,
  };
  const defaultPhase2: LifePlan["phase2"] = {
    vehicle: "--",
    C: 60,
    rate: 0,
  };
  const defaultPhase3: LifePlan["phase3"] = {
    location: "--",
    occupation: "--",
    rate: 0,
    freq: "year",
    withdraw: 0,
    D: 80,
  };

  return answers.map((self, i) => {
    const p1Idx = pickFor(i, 1);
    const p2Idx = pickFor(i, 2);
    const p3Idx = pickFor(i, 3);
    const plan: LifePlan = {
      phase1: answers[p1Idx].phase1 ?? self.phase1 ?? defaultPhase1,
      phase2: answers[p2Idx].phase2 ?? self.phase2 ?? defaultPhase2,
      phase3: answers[p3Idx].phase3 ?? self.phase3 ?? defaultPhase3,
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

export function makeLifePlanWordProblem(plan: LifePlan): string {
  return [
    "Life Plan Word Problem:\n",
    "Phase 1 - Early Career:\n",
    `You are a ${plan.phase1.occupation} living in ${plan.phase1.city}.`,
    `From age ${plan.phase1.A} to ${plan.phase1.B}, you invest ${formatCurrency(plan.phase1.amount)} per ${plan.phase1.freq} at ${plan.phase1.rate}% compound interest.`,
    "\n",
    "Phase 2 - Hold Period:\n",
    `After phase 1, you hold your savings in ${plan.phase2.vehicle}.`,
    `You keep the money from age ${plan.phase1.B} to ${plan.phase2.C} at ${plan.phase2.rate}% compound interest.`,
    "\n",
    "Phase 3 - Retirement:\n",
    `You retire to ${plan.phase3.location} and work as a part-time ${plan.phase3.occupation}.`,
    `During retirement, your remaining savings grow at ${plan.phase3.rate}% compounded ${plan.phase3.freq}.`,
    `You fully withdraw your savings by age ${plan.phase3.D}.`,
    "\n",
    "Questions:\n",
    `1. What is your balance at age ${plan.phase1.B} after the early career investment period?`,
    `2. What is your balance at age ${plan.phase2.C} after the hold period?`,
    `3. What is your periodic payout amount during retirement under the withdrawal schedule?`,
    "\n",
    "Write your answers as numbers or calculations based on the three phases above.",
  ].join("\n");
}
