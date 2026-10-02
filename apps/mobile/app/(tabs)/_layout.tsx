import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, radii, Ring, spacing, type IconName, useOrbitTheme } from '@orbit/ui';

const TabIcon = ({
  name,
  focused,
  ask = false,
}: {
  name: IconName;
  focused: boolean;
  ask?: boolean;
}): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <View
      style={[
        styles.icon,
        ask && styles.ask,
        focused && !ask && { borderColor: colors.hairlineStrong, borderWidth: 1 },
      ]}
    >
      {ask ? (
        <Ring value={focused ? 1 : 0.7} tone="rented" size={47} seed="ask-tab" />
      ) : (
        <Icon name={name} size={21} color={focused ? colors.ink : colors.inkFaint} />
      )}
    </View>
  );
};

export default function TabLayout(): ReactNode {
  const { colors } = useOrbitTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: [
          styles.bar,
          { backgroundColor: colors.surface, borderTopColor: colors.hairline },
        ],
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabIcon name="sun" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="circle"
        options={{
          title: 'Circle',
          tabBarIcon: ({ focused }) => <TabIcon name="circle" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ask"
        options={{
          title: 'Ask',
          tabBarIcon: ({ focused }) => <TabIcon name="search" focused={focused} ask />,
        }}
      />
      <Tabs.Screen
        name="skills"
        options={{
          title: 'Skills',
          tabBarIcon: ({ focused }) => <TabIcon name="stack" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ focused }) => <TabIcon name="person" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { height: spacing.xxl * 2, paddingTop: spacing.sm, paddingBottom: spacing.md },
  label: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 10 },
  icon: {
    width: 34,
    height: 30,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ask: { width: 47, height: 47, borderRadius: radii.sm, marginTop: -spacing.lg },
});
