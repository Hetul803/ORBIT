export const PRODUCT_NAME = 'ORBIT';
export const API_VERSION = 'v1';
export const MAX_AGENT_CONVERSATION_TURNS = 12;
export const MAX_AGENT_CONVERSATION_TOKENS = 5_000;
export const ACTIVE_AGENT_WINDOW_DAYS = 14;
export const DELETION_GRACE_DAYS = 7;

export const intentKinds = [
  'dating',
  'friendship',
  'roommate',
  'cofounder',
  'study_partner',
  'gym_partner',
  'mentor',
  'hiring',
  'exchange',
] as const;

export const memoryKinds = [
  'trait',
  'preference',
  'goal',
  'constraint',
  'person',
  'event',
  'voice',
] as const;

export const trustModes = ['ask_first', 'do_and_tell', 'just_handle_it'] as const;

export const activityActors = ['user', 'agent', 'system', 'admin'] as const;
