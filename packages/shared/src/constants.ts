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

export const ORBIT_COLORS = {
  light: {
    ground: '#F7F5F0',
    surface: '#FFFFFF',
    ink: '#16150F',
    inkMuted: '#4A463C',
    inkFaint: '#6B6659',
    hairline: '#E4E0D6',
    hairlineStrong: '#D6D1C4',
    yours: '#14634E',
    rented: '#4A3FD0',
    alert: '#8C3A1E',
  },
  dark: {
    ground: '#13120F',
    surface: '#1B1A16',
    ink: '#F4F1EC',
    inkMuted: '#B8B3A8',
    inkFaint: '#8F8A7E',
    hairline: '#2C2A24',
    hairlineStrong: '#3A382F',
    yours: '#3FCF8E',
    rented: '#8F86FF',
    alert: '#E08A66',
  },
} as const;
