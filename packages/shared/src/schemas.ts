import { z } from 'zod';

import { activityActors, intentKinds, memoryKinds, trustModes } from './constants.js';

export const idSchema = z.string().min(8).max(64);
export const isoDateSchema = z.iso.datetime();
export const intentKindSchema = z.enum(intentKinds);
export const memoryKindSchema = z.enum(memoryKinds);
export const trustModeSchema = z.enum(trustModes);
export const activityActorSchema = z.enum(activityActors);

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export const userSchema = z.object({
  id: idSchema,
  email: z.email(),
  emailVerifiedAt: isoDateSchema.nullable(),
  eduVerifiedAt: isoDateSchema.nullable(),
  phone: z.string().nullable(),
  phoneVerifiedAt: isoDateSchema.nullable(),
  ageVerifiedAt: isoDateSchema.nullable(),
  displayName: z.string().min(1).max(80),
  handle: z.string().min(2).max(40).nullable(),
  locale: z.string(),
  timezone: z.string(),
  status: z.enum(['active', 'pending_deletion', 'suspended']),
  deletionRequestedAt: isoDateSchema.nullable(),
});

export const otpRequestSchema = z.object({
  email: z.email(),
});

export const otpVerifySchema = z.object({
  email: z.email(),
  code: z.string().regex(/^\d{6}$/),
  dateOfBirth: z.iso.date(),
  displayName: z.string().trim().min(1).max(80),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20),
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: userSchema,
});

export const verifyEduSchema = z.object({
  email: z.email().refine((email) => email.toLowerCase().endsWith('.edu'), {
    message: 'A .edu address is required',
  }),
  code: z.string().regex(/^\d{6}$/),
});

export const verifyEduRequestSchema = verifyEduSchema.pick({ email: true });

export const verifyPhoneSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().regex(/^\d{6}$/),
});

export const verifyPhoneRequestSchema = verifyPhoneSchema.pick({ phone: true });

export const voiceProfileSchema = z.object({
  tone: z.array(z.string()).default([]),
  sentenceStyle: z.string().default('direct and natural'),
  vocabulary: z.array(z.string()).default([]),
  avoids: z.array(z.string()).default([]),
  examples: z.array(z.string()).max(12).default([]),
});

export const agentSchema = z.object({
  id: idSchema,
  userId: idSchema,
  name: z.string().min(1).max(48),
  identitySeed: z.string().min(8),
  voiceProfile: voiceProfileSchema,
  autonomyDefaults: z.record(z.string(), trustModeSchema),
  profileSummary: z.string(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createAgentSchema = z.object({
  name: z.string().trim().min(1).max(48),
});

export const updateAgentSchema = createAgentSchema.partial().extend({
  autonomyDefaults: z.record(z.string(), trustModeSchema).optional(),
});

export const interviewTurnSchema = z.object({
  sessionId: z.string().min(8).optional(),
  answer: z.string().trim().min(1).max(4_000),
  inputMode: z.enum(['text', 'voice']).default('text'),
});

export const interviewTurnResponseSchema = z.object({
  sessionId: z.string(),
  question: z.string(),
  progress: z.number().min(0).max(1),
  complete: z.boolean(),
  learnedFacts: z.array(z.object({ kind: memoryKindSchema, content: z.string() })),
  profilePreview: z.array(z.object({ label: z.string(), value: z.string() })),
});

export const memoryFactSchema = z.object({
  id: idSchema,
  agentId: idSchema,
  kind: memoryKindSchema,
  content: z.string().min(1),
  confidence: z.number().min(0).max(1),
  source: z.enum(['interview', 'import', 'correction', 'outcome']),
  userEditedAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const updateMemoryFactSchema = z.object({
  content: z.string().trim().min(1).max(2_000),
  kind: memoryKindSchema.optional(),
});

export const importedFactSchema = z.object({
  kind: memoryKindSchema,
  content: z.string(),
  confidence: z.number().min(0).max(1),
  selected: z.boolean(),
});

export const intentSchema = z.object({
  id: idSchema,
  userId: idSchema,
  kind: intentKindSchema,
  active: z.boolean(),
  params: z.record(z.string(), z.unknown()),
  pausedUntil: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const upsertIntentSchema = z.object({
  active: z.boolean(),
  params: z.record(z.string(), z.unknown()).default({}),
  pausedUntil: isoDateSchema.nullable().optional(),
});

export const exchangeItemSchema = z.object({
  id: idSchema,
  userId: idSchema,
  direction: z.enum(['have', 'want']),
  title: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  condition: z.string().max(120).nullable(),
  description: z.string().max(2_000),
  priceLowCents: z.number().int().nonnegative().nullable(),
  priceHighCents: z.number().int().nonnegative().nullable(),
  willTradeFor: z.string().max(500).nullable(),
  urgency: z.enum(['low', 'normal', 'high']),
  active: z.boolean(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createExchangeItemSchema = exchangeItemSchema.omit({
  id: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const agentMessageSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  speakerAgentId: idSchema,
  turnIndex: z.number().int().nonnegative(),
  redactedContent: z.string(),
  createdAt: isoDateSchema,
});

export const verdictSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string()).length(3),
  flags: z.array(z.string()),
  suggestedFirstActivity: z.string(),
  oneLineReason: z.string(),
});

export const introductionSchema = z.object({
  id: idSchema,
  conversationId: idSchema,
  intentKind: intentKindSchema,
  otherAgent: z.object({
    id: idSchema,
    name: z.string(),
    identitySeed: z.string(),
  }),
  verdict: verdictSchema,
  myDecision: z.enum(['pending', 'reveal', 'decline']),
  otherDecision: z.enum(['pending', 'reveal', 'decline']),
  revealedAt: isoDateSchema.nullable(),
  revealedFields: z.record(z.string(), z.string()),
  expiresAt: isoDateSchema,
});

export const transcriptSchema = z.object({
  introduction: introductionSchema,
  redactionPassed: z.literal(true),
  messages: z.array(agentMessageSchema),
});

export const introductionDecisionSchema = z.object({
  decision: z.enum(['reveal', 'decline']),
  fields: z
    .array(z.enum(['first_name', 'handle', 'phone']))
    .max(3)
    .default([]),
});

export const introductionOutcomeSchema = z.object({
  met: z.boolean(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1_000).optional(),
});

export const briefItemSchema = z.object({
  id: idSchema,
  kind: z.enum(['introduction', 'watcher_hit', 'task', 'inbox', 'exchange']),
  title: z.string(),
  detail: z.string(),
  skillName: z.string(),
  durationMs: z.number().int().nonnegative(),
  autonomy: z.number().min(0).max(1),
  needsUser: z.boolean(),
  href: z.string(),
});

export const dailyBriefSchema = z.object({
  date: z.iso.date(),
  greeting: z.string(),
  completedCount: z.number().int().nonnegative(),
  needsUserCount: z.number().int().nonnegative(),
  timeSavedMinutesThisWeek: z.number().int().nonnegative(),
  running: z
    .object({ id: idSchema, title: z.string(), progress: z.number().min(0).max(1) })
    .nullable(),
  items: z.array(briefItemSchema),
});

export const inboxItemSchema = z.object({
  id: idSchema,
  kind: z.enum(['agent_request', 'connector', 'system']),
  subject: z.string(),
  body: z.string(),
  triage: z.enum(['auto_declined', 'held', 'escalated', 'answered']),
  agentReply: z.string().nullable(),
  approvedAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
});

export const approveInboxSchema = z.object({
  editedReply: z.string().trim().min(1).max(4_000),
});

export const screeningRuleSchema = z.object({
  id: idSchema,
  matchOn: z.record(z.string(), z.unknown()),
  action: z.enum(['allow', 'hold', 'decline']),
  priority: z.number().int().min(0).max(1_000),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const upsertScreeningRuleSchema = screeningRuleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const watcherSpecSchema = z.object({
  query: z.string().min(1),
  source: z.enum(['orbit', 'email', 'calendar', 'files', 'manual']),
  constraints: z.record(z.string(), z.unknown()).default({}),
  notifyOn: z.string().default('new match'),
});

export const watcherSchema = z.object({
  id: idSchema,
  title: z.string(),
  spec: watcherSpecSchema,
  schedule: z.string(),
  active: z.boolean(),
  lastRunAt: isoDateSchema.nullable(),
  nextRunAt: isoDateSchema.nullable(),
  hitCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createWatcherSchema = z.object({
  naturalLanguage: z.string().trim().min(3).max(2_000),
  title: z.string().trim().min(1).max(120).optional(),
  schedule: z.string().default('0 */6 * * *'),
  confirmedSpec: watcherSpecSchema.optional(),
});

export const watcherHitSchema = z.object({
  id: idSchema,
  watcherId: idSchema,
  title: z.string(),
  detail: z.string(),
  href: z.string().optional(),
  seenAt: isoDateSchema.nullable(),
  createdAt: isoDateSchema,
});

export const modelCallReceiptSchema = z.object({
  id: idSchema,
  task: z.string(),
  provider: z.string(),
  model: z.string(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  costCents: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
});

export const runSchema = z.object({
  id: idSchema,
  kind: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'paused_cost_cap']),
  steps: z.array(
    z.object({
      name: z.string(),
      status: z.enum(['pending', 'running', 'succeeded', 'failed', 'skipped']),
      detail: z.string(),
      durationMs: z.number().int().nonnegative(),
    }),
  ),
  modelCalls: z.array(modelCallReceiptSchema),
  costCents: z.number().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  firstRunComparison: z
    .object({
      actionsSaved: z.number().int(),
      durationSavedMs: z.number().int(),
      modelCallsSaved: z.number().int(),
      costSavedCents: z.number(),
    })
    .nullable(),
  createdAt: isoDateSchema,
});

export const skillStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  instruction: z.string(),
  tool: z.string().nullable(),
  requiresApproval: z.boolean(),
  successCheck: z.string(),
});

export const skillDefinitionSchema = z.object({
  trigger: z.string(),
  steps: z.array(skillStepSchema).min(1),
  rules: z.array(z.string()),
  checks: z.array(z.string()).min(1),
  permissions: z.array(z.string()),
  fallback: z.string(),
});

export const skillSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(120),
  version: z.number().int().positive(),
  definition: skillDefinitionSchema,
  autonomyPct: z.number().int().min(0).max(100),
  confidence: z.number().min(0).max(1),
  adoptionCount: z.number().int().nonnegative(),
  status: z.enum(['draft', 'validating', 'active', 'paused', 'retired']),
  runCount: z.number().int().nonnegative(),
  successRate: z.number().min(0).max(1),
  effect: z.string(),
  reusedBy: z.array(z.object({ id: idSchema, name: z.string() })),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createSkillSchema = z.object({
  name: z.string().trim().min(1).max(120),
  definition: skillDefinitionSchema,
  autonomyPct: z.number().int().min(0).max(100).default(0),
});

export const skillCorrectionSchema = z.object({
  correction: z.string().trim().min(1).max(2_000),
  revisedDefinition: skillDefinitionSchema,
});

export const learningReceiptSchema = z.object({
  id: idSchema,
  skillId: idSchema,
  headline: z.string(),
  reusableSteps: z.number().int().nonnegative(),
  firstRunActions: z.number().int().nonnegative(),
  currentRunActions: z.number().int().nonnegative(),
  firstRunModelCalls: z.number().int().nonnegative(),
  currentRunModelCalls: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  fallbackUsed: z.boolean(),
  createdAt: isoDateSchema,
});

export const groupSchema = z.object({
  id: idSchema,
  kind: z.enum(['campus', 'club', 'lab', 'class']),
  name: z.string(),
  visibility: z.enum(['private', 'domain', 'public']),
  memberCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
});

export const joinGroupSchema = z.object({
  code: z.string().trim().min(4).max(32),
});

export const blockSchema = z.object({
  userId: idSchema,
  reason: z.string().trim().min(1).max(1_000),
});

export const reportSchema = z.object({
  subjectUserId: idSchema,
  conversationId: idSchema.optional(),
  category: z.enum(['harassment', 'sexual', 'minor', 'coercion', 'spam', 'fraud', 'other']),
  detail: z.string().trim().min(1).max(2_000),
});

export const safetyPlanSchema = z.object({
  introductionId: idSchema,
  placeName: z.string().trim().min(1).max(160),
  meetAt: isoDateSchema,
  shareWithContact: z.boolean().default(false),
});

export const activitySchema = z.object({
  id: idSchema,
  actorType: activityActorSchema,
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: isoDateSchema,
});

export const askInterpretationSchema = z.object({
  input: z.string().trim().min(1).max(4_000),
});

export const askInterpretationResponseSchema = z.object({
  kind: z.enum(['watcher', 'task', 'exchange', 'intent', 'agent_question']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  structured: z.record(z.string(), z.unknown()),
  requiresApproval: z.literal(true),
});

export type UserDto = z.infer<typeof userSchema>;
export type AgentDto = z.infer<typeof agentSchema>;
export type MemoryFactDto = z.infer<typeof memoryFactSchema>;
export type IntentDto = z.infer<typeof intentSchema>;
export type IntentKind = z.infer<typeof intentKindSchema>;
export type ExchangeItemDto = z.infer<typeof exchangeItemSchema>;
export type IntroductionDto = z.infer<typeof introductionSchema>;
export type TranscriptDto = z.infer<typeof transcriptSchema>;
export type VerdictDto = z.infer<typeof verdictSchema>;
export type DailyBriefDto = z.infer<typeof dailyBriefSchema>;
export type InboxItemDto = z.infer<typeof inboxItemSchema>;
export type ScreeningRuleDto = z.infer<typeof screeningRuleSchema>;
export type WatcherDto = z.infer<typeof watcherSchema>;
export type WatcherHitDto = z.infer<typeof watcherHitSchema>;
export type RunDto = z.infer<typeof runSchema>;
export type SkillDto = z.infer<typeof skillSchema>;
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;
export type LearningReceiptDto = z.infer<typeof learningReceiptSchema>;
export type GroupDto = z.infer<typeof groupSchema>;
export type ActivityDto = z.infer<typeof activitySchema>;
