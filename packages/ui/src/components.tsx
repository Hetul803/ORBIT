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

import { colors, radii, spacing } from './tokens';

type TypeVariant = 'display' | 'title' | 'body' | 'label' | 'mono' | 'caption';

export const OrbitText = ({
  variant = 'body',
  style,
  ...props
}: TextProps & { variant?: TypeVariant }): ReactNode => (
  <Text style={[styles[variant], style]} {...props} />
);

export const Screen = ({
  children,
  scroll = true,
  contentStyle,
}: PropsWithChildren<{ scroll?: boolean; contentStyle?: ViewStyle }>): ReactNode => (
  <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
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

export const Card = ({
  children,
  style,
  tone = 'paper',
}: PropsWithChildren<{
  style?: ViewStyle;
  tone?: 'paper' | 'moss' | 'ember' | 'blue';
}>): ReactNode => (
  <View
    style={[
      styles.card,
      tone === 'moss' && styles.cardMoss,
      tone === 'ember' && styles.cardEmber,
      tone === 'blue' && styles.cardBlue,
      style,
    ]}
  >
    {children}
  </View>
);

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
}): ReactNode => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    testID={testID}
    disabled={disabled || loading}
    onPress={onPress}
    style={({ pressed }) => [
      styles.button,
      kind === 'secondary' && styles.buttonSecondary,
      kind === 'quiet' && styles.buttonQuiet,
      kind === 'danger' && styles.buttonDanger,
      (disabled || loading) && styles.buttonDisabled,
      pressed && styles.pressed,
    ]}
  >
    {loading ? (
      <ActivityIndicator color={kind === 'secondary' ? colors.ink : colors.white} />
    ) : (
      icon
    )}
    <OrbitText
      variant="label"
      style={[
        styles.buttonText,
        (kind === 'secondary' || kind === 'quiet') && styles.buttonTextDark,
      ]}
    >
      {label}
    </OrbitText>
  </Pressable>
);

export const Pill = ({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: 'neutral' | 'moss' | 'ember' | 'blue' }>): ReactNode => (
  <View
    style={[
      styles.pill,
      tone === 'moss' && styles.pillMoss,
      tone === 'ember' && styles.pillEmber,
      tone === 'blue' && styles.pillBlue,
    ]}
  >
    <OrbitText variant="caption" style={styles.pillText}>
      {children}
    </OrbitText>
  </View>
);

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

export const Hairline = (): ReactNode => <View style={styles.hairline} />;

export type IconName =
  | 'sun'
  | 'circle'
  | 'spark'
  | 'stack'
  | 'person'
  | 'arrow'
  | 'check'
  | 'clock'
  | 'shield'
  | 'mail'
  | 'eye';

export const Icon = ({
  name,
  size = 22,
  color = colors.ink,
  strokeWidth = 1.8,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}): ReactNode => {
  const common = {
    stroke: color,
    strokeWidth,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
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
      {name === 'spark' && (
        <Path
          d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2zM19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17z"
          {...common}
        />
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
    </Svg>
  );
};

export const Skeleton = ({
  width = '100%',
  height = 18,
}: {
  width?: ViewStyle['width'];
  height?: number;
}): ReactNode => <View style={[styles.skeleton, { width, height }]} />;

const font = {
  display: 'InstrumentSerif_400Regular',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_600SemiBold',
  mono: 'MartianMono_500Medium',
} as const;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  screen: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  flex: { flex: 1 },
  display: {
    fontFamily: font.display,
    fontSize: 47,
    lineHeight: 48,
    color: colors.ink,
    letterSpacing: -1.1,
  },
  title: {
    fontFamily: font.display,
    fontSize: 29,
    lineHeight: 33,
    color: colors.ink,
    letterSpacing: -0.35,
  },
  body: { fontFamily: font.sans, fontSize: 16, lineHeight: 23, color: colors.inkSoft },
  label: { fontFamily: font.sansMedium, fontSize: 15, lineHeight: 19, color: colors.ink },
  mono: {
    fontFamily: font.mono,
    fontSize: 10,
    lineHeight: 15,
    letterSpacing: 1.5,
    color: colors.inkSoft,
    textTransform: 'uppercase',
  },
  caption: { fontFamily: font.sans, fontSize: 12, lineHeight: 16, color: colors.inkSoft },
  card: {
    backgroundColor: colors.paperRaised,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.md,
  },
  cardMoss: { backgroundColor: colors.mossLight, borderColor: '#BDD0B9' },
  cardEmber: { backgroundColor: colors.emberLight, borderColor: '#E4BCAE' },
  cardBlue: { backgroundColor: colors.blueLight, borderColor: '#B8CFDF' },
  button: {
    minHeight: 52,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  buttonSecondary: { backgroundColor: colors.transparent, borderWidth: 1, borderColor: colors.ink },
  buttonQuiet: {
    backgroundColor: colors.transparent,
    minHeight: 42,
    paddingHorizontal: spacing.md,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.white },
  buttonTextDark: { color: colors.ink },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    backgroundColor: '#EBE5DA',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillMoss: { backgroundColor: colors.mossLight },
  pillEmber: { backgroundColor: colors.emberLight },
  pillBlue: { backgroundColor: colors.blueLight },
  pillText: { color: colors.ink },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  eyebrow: { marginBottom: spacing.xs },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  skeleton: { borderRadius: radii.sm, backgroundColor: '#E8E1D6' },
});
