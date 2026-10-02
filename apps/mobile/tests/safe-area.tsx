import type { PropsWithChildren, ReactNode } from 'react';
import { View } from 'react-native';

export const SafeAreaView = ({
  children,
  ...props
}: PropsWithChildren<Record<string, unknown>>): ReactNode => <View {...props}>{children}</View>;
export const SafeAreaProvider = ({ children }: PropsWithChildren): ReactNode => children;
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });
