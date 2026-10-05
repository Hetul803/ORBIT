export interface BriefItem {
  id: string;
  kind: 'introduction' | 'watcher_hit' | 'task' | 'inbox';
  title: string;
  detail: string;
  skillName: string;
  durationMs: number;
  autonomy: number;
  needsUser: boolean;
  href: string;
}

export interface DailyBrief {
  date: string;
  greeting: string;
  completedCount: number;
  needsUserCount: number;
  timeSavedMinutesThisWeek: number;
  running: { title: string; progress: number } | null;
  items: BriefItem[];
}

export interface SourceCitation {
  sourceId: string;
  kind: 'email' | 'calendar';
  title: string;
  url: string;
  quote: string;
  occurredAt: string | null;
}

export interface LifeItem {
  id: string;
  kind: 'catch' | 'nudge' | 'draft';
  status: 'active' | 'dismissed' | 'snoozed' | 'completed';
  title: string;
  detail: string;
  evidence: SourceCitation[];
  confidence: number;
  dueAt: string | null;
  snoozedUntil: string | null;
  draft: string | null;
  createdAt: string;
}

export interface LifeAnswer {
  answer: string;
  sources: SourceCitation[];
  confidence: number;
}

export interface Introduction {
  id: string;
  intentKind: string;
  status: string;
  score: number | null;
  oneLineReason: string | null;
  reasons: string[];
  suggestedFirstActivity: string | null;
  myDecision: 'pending' | 'reveal' | 'decline';
  theirDecision: 'pending' | 'reveal' | 'decline';
  revealed: boolean;
  revealedProfile: Record<string, string> | null;
  expiresAt: string;
  createdAt: string;
}

export interface Skill {
  id: string;
  name: string;
  version: number;
  autonomyPct: number;
  confidence: number;
  adoptionCount: number;
  status: string;
  runCount: number;
  successRate: number;
  effect: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  handle: string | null;
  eduVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  status: string;
  deletionRequestedAt: string | null;
  role: 'user' | 'moderator' | 'admin';
}
