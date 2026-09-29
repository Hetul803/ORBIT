import type { DailyBrief, Introduction, Skill } from './types';

export const demoBrief: DailyBrief = {
  date: new Date().toISOString().slice(0, 10),
  greeting: 'Four done. One needs you.',
  completedCount: 4,
  needsUserCount: 1,
  timeSavedMinutesThisWeek: 47,
  running: null,
  items: [
    {
      id: 'seed-introduction-01',
      kind: 'introduction',
      title: 'Morrow found a calm, promising fit',
      detail: 'The same pace, with enough difference to stay interesting.',
      skillName: 'INTRODUCTIONS',
      durationMs: 8240,
      autonomy: 0.62,
      needsUser: true,
      href: '/introduction/seed-introduction-01',
    },
    {
      id: 'seed-watcher-01',
      kind: 'watcher_hit',
      title: 'A sublet matched your ceiling',
      detail: '$875 and 0.6 miles away. Quiet hours listed.',
      skillName: 'HOUSING WATCH',
      durationMs: 1320,
      autonomy: 0.94,
      needsUser: false,
      href: '/watchers',
    },
    {
      id: 'seed-run-current',
      kind: 'task',
      title: 'Your week was repaired',
      detail: '15 actions avoided compared with the first run.',
      skillName: 'REPAIR MY WEEK',
      durationMs: 4000,
      autonomy: 0.72,
      needsUser: false,
      href: '/run/seed-run-current',
    },
  ],
};

export const demoIntroductions: Introduction[] = [
  {
    id: 'seed-introduction-01',
    intentKind: 'friendship',
    status: 'pending',
    score: 91,
    oneLineReason: 'The same calm pace, with enough difference to stay interesting.',
    reasons: [
      'Both prefer direct plans over open-ended maybes.',
      'They protect quiet work time and still make room for community.',
      'Neither expects instant closeness; both value consistency.',
    ],
    suggestedFirstActivity: 'Compare favorite study systems over coffee.',
    myDecision: 'pending',
    theirDecision: 'reveal',
    revealed: false,
    revealedProfile: null,
    expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    createdAt: new Date().toISOString(),
  },
];

export const demoSkills: Skill[] = [
  {
    id: 'seed-skill-01',
    name: 'Repair my week',
    version: 2,
    autonomyPct: 62,
    confidence: 0.92,
    adoptionCount: 14,
    status: 'active',
    runCount: 8,
    successRate: 0.875,
    effect: '15 fewer actions and 71% less model work after learning.',
    updatedAt: new Date().toISOString(),
  },
];
