import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { Card, colors, Icon, OrbitText, radii, spacing } from '@orbit/ui';

export const Wordmark = (): ReactNode => (
  <View style={styles.wordmark}>
    <View style={styles.mark}>
      <View style={styles.markDot} />
    </View>
    <OrbitText variant="mono" style={styles.wordmarkText}>
      ORBIT
    </OrbitText>
  </View>
);

export const AppHeader = ({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}): ReactNode => (
  <View style={styles.header}>
    <View style={styles.flex}>
      <OrbitText variant="mono" style={styles.eyebrow}>
        ORBIT / PRIVATE AGENT
      </OrbitText>
      <OrbitText variant="display">{title}</OrbitText>
      {subtitle === undefined ? null : <OrbitText style={styles.subtitle}>{subtitle}</OrbitText>}
    </View>
    {action}
  </View>
);

export const Field = ({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }): ReactNode => (
  <View style={styles.fieldWrap}>
    <OrbitText variant="label">{label}</OrbitText>
    <TextInput
      placeholderTextColor="#8A847A"
      style={[styles.field, props.multiline === true && styles.fieldMultiline]}
      {...props}
    />
    {hint === undefined ? null : <OrbitText variant="caption">{hint}</OrbitText>}
  </View>
);

export const Metric = ({ value, label }: { value: string; label: string }): ReactNode => (
  <View style={styles.metric}>
    <OrbitText variant="title">{value}</OrbitText>
    <OrbitText variant="caption">{label}</OrbitText>
  </View>
);

export const Notice = ({
  title,
  detail,
  tone = 'blue',
}: {
  title: string;
  detail: string;
  tone?: 'blue' | 'ember' | 'moss';
}): ReactNode => (
  <Card tone={tone}>
    <OrbitText variant="label">{title}</OrbitText>
    <OrbitText>{detail}</OrbitText>
  </Card>
);

export const RowLink = ({
  title,
  detail,
  onPress,
  icon = 'arrow',
}: {
  title: string;
  detail?: string;
  onPress: () => void;
  icon?: 'arrow' | 'shield' | 'mail' | 'eye';
}): ReactNode => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.flex}>
      <OrbitText variant="label">{title}</OrbitText>
      {detail === undefined ? null : <OrbitText variant="caption">{detail}</OrbitText>}
    </View>
    <Icon name={icon} size={20} />
  </Pressable>
);

export const ErrorText = ({ message }: { message: string }): ReactNode => (
  <OrbitText variant="caption" style={styles.error}>
    {message}
  </OrbitText>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ember },
  wordmarkText: { color: colors.ink, letterSpacing: 3 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  eyebrow: { marginBottom: spacing.sm },
  subtitle: { marginTop: spacing.sm, maxWidth: 330 },
  fieldWrap: { gap: spacing.sm },
  field: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    backgroundColor: colors.paperRaised,
    paddingHorizontal: spacing.lg,
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 16,
    color: colors.ink,
  },
  fieldMultiline: { minHeight: 126, paddingTop: spacing.lg, textAlignVertical: 'top' },
  metric: { flex: 1, gap: spacing.xs },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.55 },
  error: { color: colors.danger },
});
