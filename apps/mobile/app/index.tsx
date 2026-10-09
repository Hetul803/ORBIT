import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/store';

export default function Index(): ReactNode {
  const accessToken = useAuthStore((state) => state.accessToken);
  const resumeOnboarding = useAuthStore((state) => state.resumeOnboarding);
  return (
    <Redirect href={accessToken === null ? '/sign-in' : resumeOnboarding ? '/agent' : '/today'} />
  );
}
