import { z } from 'zod';

const confidence = z.number().int().min(0).max(100);
const money = z.number().finite().min(-1_000_000_000).max(1_000_000_000);
const shortText = z.string().trim().min(1).max(600);

const observedSchema = z.object({
  monthlyIncome: money.nonnegative(),
  monthlySpending: money.nonnegative(),
  essentialMonthly: money.nonnegative(),
  currentCash: money.nonnegative(),
  liquidSavings: money.nonnegative(),
  totalDebt: money.nonnegative(),
  monthlyDebtPayments: money.nonnegative(),
  recurringMonthly: money.nonnegative(),
  netWorth: money,
  safeToSpend: money.nonnegative(),
  recordCount: z.number().int().min(0).max(10_000),
  observedDays: z.number().int().min(0).max(3650),
});

const predictionSchema = z.object({
  cashGapProbability: confidence.nullable(),
  forecastConfidence: confidence,
  validationStatus: z.enum(['unavailable', 'provisional', 'limited', 'validated']).optional(),
  completedBacktests: z.number().int().min(0).max(120).optional(),
  day30Mae: money.nonnegative().nullable().optional(),
  intervalCoverage: z.number().finite().min(0).max(1).nullable().optional(),
  brierScore: z.number().finite().min(0).max(1).nullable().optional(),
  calibrationStatus: z.enum(['unavailable', 'limited', 'calibrated', 'needs-calibration']).optional(),
  gapDay: z.number().int().min(1).max(365).nullable(),
  spendingTrendPercent: z.number().finite().min(-500).max(500),
  emergencyRunwayMonths: z.number().finite().min(0).max(1200),
  debtPressurePercent: confidence,
});

const actionSchema = z.object({
  id: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(140),
  rationale: z.string().trim().min(1).max(500),
  expectedImpact: z.string().trim().min(1).max(300),
  timeframe: z.string().trim().min(1).max(80),
  confidence,
  uncertainty: z.string().trim().min(1).max(400),
});

const snapshotSchema = z.object({
  healthScore: confidence,
  safeToSpend: money.nonnegative(),
  cashGapProbability: confidence,
  totalDebt: money.nonnegative(),
  leadingRecommendation: z.string().trim().max(140).nullable(),
});

const categorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  monthlyAverage: money.nonnegative(),
  plannedMonthlyCap: money.nonnegative(),
  sharePercent: confidence,
  flexible: z.boolean(),
});

const planSchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  monthlyIncome: money.nonnegative(),
  plannedBills: money.nonnegative(),
  goalContribution: money.nonnegative(),
  everydayBudget: money.nonnegative(),
  dailyAllowance: money.nonnegative(),
  weeklyAllowance: money.nonnegative(),
  unallocated: money,
  flexibleTrimPercent: confidence,
  spentToday: money.nonnegative(),
  upcoming: z.array(z.object({
    kind: z.enum(['bill', 'income']),
    label: z.string().trim().min(1).max(60),
    amount: money.nonnegative(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })).max(12),
});

export const copilotRequestSchema = z.object({
  apiVersion: z.literal('1.0'),
  question: z.string().trim().min(2).max(800),
  conversation: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().trim().min(1).max(1200),
  })).max(8).default([]),
  financialContext: z.object({
    analysisVersion: z.string().trim().min(1).max(20),
    currency: z.literal('INR'),
    dataQuality: confidence,
    observed: observedSchema,
    prediction: predictionSchema,
    recommendations: z.array(actionSchema).min(1).max(6),
    categories: z.array(categorySchema).max(12).optional(),
    plan: planSchema.optional(),
    preferences: z.object({
      primaryGoal: z.string().trim().min(1).max(100),
      monthlyTarget: money.nonnegative(),
      emergencyMonths: z.number().int().min(1).max(24),
      style: z.string().trim().min(1).max(80),
      timeHorizon: z.string().trim().min(1).max(80),
    }),
    change: z.object({
      label: z.string().trim().min(1).max(180),
      before: snapshotSchema,
      after: snapshotSchema,
    }).nullable(),
  }),
}).strict();

const evidenceItem = z.object({
  statement: shortText,
  evidence: shortText,
  confidence,
  missingInformation: z.string().trim().max(300),
});

export const copilotResponseSchema = z.object({
  directAnswer: z.string().trim().min(1).max(900),
  schedule: z.array(z.object({
    period: z.string().trim().min(1).max(60),
    plan: z.string().trim().min(1).max(400),
  })).max(10).optional(),
  observedFacts: z.array(evidenceItem).max(4).optional(),
  predictions: z.array(z.object({
    statement: shortText,
    horizon: z.string().trim().min(1).max(100),
    confidence,
    uncertainty: z.string().trim().min(1).max(400),
  })).max(3).optional(),
  recommendations: z.array(z.object({
    action: z.string().trim().min(1).max(180),
    rationale: z.string().trim().min(1).max(500),
    expectedImpact: z.string().trim().min(1).max(350),
    timeframe: z.string().trim().min(1).max(100),
    confidence,
    assumptions: z.array(z.string().trim().min(1).max(240)).max(4),
  })).max(3).optional(),
  changeExplanation: z.object({
    changed: z.boolean(),
    summary: z.string().trim().min(1).max(500),
    drivers: z.array(z.string().trim().min(1).max(220)).max(4),
  }).optional(),
  sourceIds: z.array(z.string().trim().min(1).max(60)).max(4),
  disclaimer: z.string().trim().min(1).max(400).optional(),
});
