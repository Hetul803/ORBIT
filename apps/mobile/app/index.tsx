import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';

import { useAuthStore } from '@/store';

export default function Index(): ReactNode {
  const accessToken = useAuthStore((state) => state.accessToken);
  return <Redirect href={accessToken === null ? '/sign-in' : '/today'} />;
}
