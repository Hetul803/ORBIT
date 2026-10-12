import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, OrbitText, spacing, useOrbitTheme, type IconName } from '@orbit/ui';

const destinations = [
  { href: '/today', label: 'Today', icon: 'sun' },
  { href: '/circle', label: 'Circle', icon: 'circle' },
  { href: '/ask', label: 'Ask', icon: 'search' },
  { href: '/skills', label: 'Skills', icon: 'stack' },
  { href: '/you', label: 'You', icon: 'person' },
] as const satisfies readonly { href: string; label: string; icon: IconName }[];

export const mainDestination = (pathname: string): (typeof destinations)[number]['href'] => {
  if (/^\/(?:circle|intents|introduction|exchange|screening)(?:\/|$)/u.test(pathname))
    return '/circle';
  if (/^\/(?:skills|skill|groups|group|watchers|watcher|run)(?:\/|$)/u.test(pathname))
    return '/skills';
  if (
    /^\/(?:you|settings|connections|memory|voice|trust|safety|verification|admin)(?:\/|$)/u.test(
      pathname,
    )
  )
    return '/you';
  if (pathname === '/ask') return '/ask';
  return '/today';
};

export const MainNavigation = (): ReactNode => {
  const { colors } = useOrbitTheme();
  const active = mainDestination(usePathname());
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ backgroundColor: colors.surface }}>
      <View accessibilityRole="tablist" style={[styles.bar, { borderTopColor: colors.hairline }]}>
        {destinations.map((item) => (
          <Pressable
            key={item.href}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active === item.href }}
            onPress={() => router.navigate(item.href)}
            style={styles.tab}
          >
            <Icon
              name={item.icon}
              size={23}
              color={active === item.href ? colors.ink : colors.inkFaint}
            />
            <OrbitText
              variant="caption"
              style={{ color: active === item.href ? colors.ink : colors.inkFaint }}
            >
              {item.label}
            </OrbitText>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
};

export const AppBack = (): ReactNode => {
  const pathname = usePathname();
  if (
    [
      '/',
      '/today',
      '/circle',
      '/ask',
      '/skills',
      '/you',
      '/sign-in',
      '/waitlist',
      '/agent',
      '/import',
    ].includes(pathname)
  )
    return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to previous screen"
      onPress={() =>
        router.canGoBack() ? router.back() : router.replace(mainDestination(pathname))
      }
      style={styles.back}
    >
      <OrbitText variant="label">← Back</OrbitText>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  tab: {
    flex: 1,
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingBottom: spacing.sm,
  },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
