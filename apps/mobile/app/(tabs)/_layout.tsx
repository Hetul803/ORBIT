import { Tabs } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, Icon, type IconName } from '@orbit/ui';

const TabIcon = ({
  name,
  focused,
  ask = false,
}: {
  name: IconName;
  focused: boolean;
  ask?: boolean;
}): ReactNode => (
  <View style={[styles.icon, ask && styles.ask, focused && !ask && styles.focused]}>
    <Icon
      name={name}
      size={ask ? 25 : 21}
      color={ask ? colors.white : focused ? colors.ink : '#767168'}
    />
  </View>
);

export default function TabLayout(): ReactNode {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: '#767168',
        tabBarStyle: styles.bar,
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
          tabBarIcon: ({ focused }) => <TabIcon name="spark" focused={focused} ask />,
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
  bar: {
    height: 86,
    paddingTop: 9,
    paddingBottom: 12,
    backgroundColor: '#FFFCF5',
    borderTopColor: '#D9D1C3',
  },
  label: { fontFamily: 'InstrumentSans_600SemiBold', fontSize: 10 },
  icon: { width: 34, height: 30, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  focused: { backgroundColor: '#E7E0D5' },
  ask: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: colors.ember,
    marginTop: -17,
    borderWidth: 4,
    borderColor: '#FFFCF5',
  },
});
