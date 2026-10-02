import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Circle, Path, Svg } from 'react-native-svg';

import { radii, spacing, useOrbitTheme } from './tokens';

type TypeVariant = 'display' | 'title' | 'body' | 'label' | 'mono' | 'caption';

const font = {
  display: 'InstrumentSerif_400Regular',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_600SemiBold',
  mono: 'MartianMono_500Medium',
} as const;

export const OrbitText = ({
  variant = 'body',
  style,
  ...props
}: TextProps & { variant?: TypeVariant }): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <Text
      style={[
        styles[variant],
        {
          color:
            variant === 'body' || variant === 'caption' || variant === 'mono'
              ? colors.inkMuted
              : colors.ink,
        },
        style,
      ]}
      {...props}
    />
  );
};

export const Screen = ({
  children,
  scroll = true,
  contentStyle,
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: ViewStyle }>): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.ground }]}
      edges={['top', 'left', 'right']}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.screen, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, styles.flex, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
};

export const Card = ({
  children,
  style,
  tone = 'paper',
}: PropsWithChildren<{
  style?: ViewStyle;
  tone?: 'paper' | 'moss' | 'ember' | 'blue' | 'yours' | 'rented' | 'alert';
}>): ReactNode => {
  const { colors } = useOrbitTheme();
  const borderColor =
    tone === 'moss' || tone === 'yours'
      ? colors.yours
      : tone === 'blue' || tone === 'rented'
        ? colors.rented
        : tone === 'ember' || tone === 'alert'
          ? colors.alert
          : colors.hairline;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor }, style]}>
      {children}
    </View>
  );
};

export const Button = ({
  label,
  onPress,
  disabled = false,
  loading = false,
  kind = 'primary',
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  icon?: ReactNode;
  testID?: string;
}): ReactNode => {
  const { colors } = useOrbitTheme();
  const outlined = kind === 'secondary' || kind === 'quiet';
  const backgroundColor =
    kind === 'danger' ? colors.alert : outlined ? colors.transparent : colors.ink;
  const foregroundColor = outlined ? colors.ink : colors.ground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      testID={testID}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor, borderColor: outlined ? colors.hairlineStrong : backgroundColor },
        kind === 'quiet' && styles.buttonQuiet,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? <ActivityIndicator color={foregroundColor} /> : icon}
      <OrbitText variant="label" style={{ color: foregroundColor }}>
        {label}
      </OrbitText>
    </Pressable>
  );
};

export const Pill = ({
  children,
  tone = 'neutral',
}: PropsWithChildren<{
  tone?: 'neutral' | 'moss' | 'ember' | 'blue' | 'yours' | 'rented' | 'alert';
}>): ReactNode => {
  const { colors } = useOrbitTheme();
  const borderColor =
    tone === 'moss' || tone === 'yours'
      ? colors.yours
      : tone === 'blue' || tone === 'rented'
        ? colors.rented
        : tone === 'ember' || tone === 'alert'
          ? colors.alert
          : colors.hairlineStrong;
  return (
    <View style={[styles.pill, { borderColor, backgroundColor: colors.surface }]}>
      <OrbitText variant="caption" style={{ color: colors.ink }}>
        {children}
      </OrbitText>
    </View>
  );
};

export const SectionHeader = ({
  eyebrow,
  title,
  aside,
}: {
  eyebrow?: string;
  title: string;
  aside?: ReactNode;
}): ReactNode => (
  <View style={styles.sectionHeader}>
    <View style={styles.flex}>
      {eyebrow === undefined ? null : (
        <OrbitText variant="mono" style={styles.eyebrow}>
          {eyebrow}
        </OrbitText>
      )}
      <OrbitText variant="title">{title}</OrbitText>
    </View>
    {aside}
  </View>
);

export const Hairline = (): ReactNode => {
  const { colors } = useOrbitTheme();
  return <View style={[styles.hairline, { backgroundColor: colors.hairline }]} />;
};

const hashSeed = (seed: string): number => {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};

export const Ring = ({
  value,
  tone,
  size = 44,
  seed = 'orbit',
}: {
  value: number;
  tone: 'yours' | 'rented';
  size?: number;
  seed?: string;
}): ReactNode => {
  const { colors } = useOrbitTheme();
  const progress = Math.max(0, Math.min(1, value > 1 ? value / 100 : value));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const pattern = hashSeed(seed);
  const accent = tone === 'yours' ? colors.yours : colors.rented;
  const rotation = -90 + (pattern % 24) - 12;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      accessibilityRole="image"
      accessibilityLabel={`${String(Math.round(progress * 100))}% ${tone} capability`}
    >
      <Circle
        cx="22"
        cy="22"
        r={radius}
        stroke={colors.hairlineStrong}
        strokeWidth="2"
        fill="none"
      />
      <Circle
        cx="22"
        cy="22"
        r={radius}
        stroke={accent}
        strokeWidth="3"
        fill="none"
        strokeLinecap="butt"
        strokeDasharray={`${String(circumference * progress)} ${String(circumference)}`}
        transform={`rotate(${String(rotation)} 22 22)`}
      />
      <Path
        d={
          pattern % 2 === 0
            ? 'M14 24c3-7 9-7 16-4M15 29c5-4 10-4 14-2'
            : 'M14 20c4 5 10 6 16 2M16 27c4-2 8-2 12 0'
        }
        stroke={accent}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="butt"
      />
    </Svg>
  );
};

export type IconName =
  | 'sun'
  | 'circle'
  | 'search'
  | 'stack'
  | 'person'
  | 'arrow'
  | 'check'
  | 'clock'
  | 'shield'
  | 'mail'
  | 'eye'
  | 'trash'
  | 'pause'
  | 'bell';

export const Icon = ({
  name,
  size = 22,
  color,
  strokeWidth = 1.5,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}): ReactNode => {
  const { colors } = useOrbitTheme();
  const common = {
    stroke: color ?? colors.ink,
    strokeWidth,
    fill: 'none',
    strokeLinecap: 'butt' as const,
    strokeLinejoin: 'miter' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {name === 'sun' && (
        <>
          <Circle cx="12" cy="12" r="4" {...common} />
          <Path
            d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
            {...common}
          />
        </>
      )}
      {name === 'circle' && (
        <>
          <Circle cx="8" cy="12" r="4" {...common} />
          <Circle cx="16" cy="12" r="4" {...common} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx="10" cy="10" r="6" {...common} />
          <Path d="M14.5 14.5L21 21" {...common} />
        </>
      )}
      {name === 'stack' && (
        <>
          <Path d="M4 7l8-4 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4" {...common} />
        </>
      )}
      {name === 'person' && (
        <>
          <Circle cx="12" cy="8" r="3" {...common} />
          <Path d="M5 21c.7-4.2 3-6 7-6s6.3 1.8 7 6" {...common} />
        </>
      )}
      {name === 'arrow' && <Path d="M5 12h14M14 7l5 5-5 5" {...common} />}
      {name === 'check' && <Path d="M5 12l4 4L19 6" {...common} />}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M12 7v6l4 2" {...common} />
        </>
      )}
      {name === 'shield' && (
        <Path d="M12 2l8 3v6c0 5-3.2 8.5-8 11-4.8-2.5-8-6-8-11V5l8-3zM9 12l2 2 4-5" {...common} />
      )}
      {name === 'mail' && (
        <Path
          d="M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zm-1 2l8 6 8-6"
          {...common}
        />
      )}
      {name === 'eye' && (
        <>
          <Path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" {...common} />
          <Circle cx="12" cy="12" r="2.5" {...common} />
        </>
      )}
      {name === 'trash' && (
        <Path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" {...common} />
      )}
      {name === 'pause' && <Path d="M8 5v14M16 5v14" {...common} />}
      {name === 'bell' && <Path d="M5 17h14l-2-3V9a5 5 0 00-10 0v5l-2 3zM10 20h4" {...common} />}
    </Svg>
  );
};

export const Skeleton = ({
  width = '100%',
  height = 18,
}: {
  width?: ViewStyle['width'];
  height?: number;
}): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <View
      accessibilityLabel="Loading"
      style={[styles.skeleton, { width, height, backgroundColor: colors.hairline }]}
    />
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  screen: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  flex: { flex: 1 },
  display: { fontFamily: font.display, fontSize: 47, lineHeight: 48, letterSpacing: -1.1 },
  title: { fontFamily: font.display, fontSize: 29, lineHeight: 33, letterSpacing: -0.35 },
  body: { fontFamily: font.sans, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: font.sansMedium, fontSize: 15, lineHeight: 19 },
  mono: {
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: font.sans, fontSize: 12, lineHeight: 16 },
  card: { borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, gap: spacing.md },
  button: {
    minHeight: 52,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonQuiet: { minHeight: 44, paddingHorizontal: spacing.md },
  buttonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  eyebrow: { marginBottom: spacing.xs },
  hairline: { height: StyleSheet.hairlineWidth },
  skeleton: { borderRadius: radii.sm },
});
