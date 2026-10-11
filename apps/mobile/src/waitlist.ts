import { create } from 'zustand';

export const useWaitlistStore = create<{
  email: string;
  verificationToken: string | null;
  capacity: number;
  paused: boolean;
  set: (value: {
    email: string;
    verificationToken: string | null;
    capacity: number;
    paused: boolean;
  }) => void;
  clear: () => void;
}>((set) => ({
  email: '',
  verificationToken: null,
  capacity: 100,
  paused: false,
  set: (value) => set(value),
  clear: () => set({ email: '', verificationToken: null, capacity: 100, paused: false }),
}));
