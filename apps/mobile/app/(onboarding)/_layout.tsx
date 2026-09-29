import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

export default function OnboardingLayout(): ReactNode {
  return <Stack screenOptions={{ headerShown: false }} />;
}
