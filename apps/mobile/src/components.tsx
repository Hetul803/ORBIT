import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, type TextInputProps, View } from 'react-native';
import { Card, Icon, OrbitText, radii, Ring, spacing, useOrbitTheme } from '@orbit/ui';

export const Wordmark = (): ReactNode => (
  <View style={styles.wordmark}>
    <Ring value={0.72} tone="yours" size={30} seed="orbit-wordmark" />
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
}: TextInputProps & { label: string; hint?: string }): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <View style={styles.fieldWrap}>
      <OrbitText variant="label">{label}</OrbitText>
      <TextInput
        accessibilityLabel={props.accessibilityLabel ?? label}
        placeholderTextColor={colors.inkFaint}
        style={[
          styles.field,
          {
            borderColor: colors.hairlineStrong,
            backgroundColor: colors.surface,
            color: colors.ink,
          },
          props.multiline === true && styles.fieldMultiline,
        ]}
        {...props}
      />
      {hint === undefined ? null : <OrbitText variant="caption">{hint}</OrbitText>}
    </View>
  );
};

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
}): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.hairline },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.flex}>
        <OrbitText variant="label">{title}</OrbitText>
        {detail === undefined ? null : <OrbitText variant="caption">{detail}</OrbitText>}
      </View>
      <Icon name={icon} size={20} />
    </Pressable>
  );
};

export const ErrorText = ({ message }: { message: string }): ReactNode => (
  <ErrorMessage message={message} />
);

const ErrorMessage = ({ message }: { message: string }): ReactNode => {
  const { colors } = useOrbitTheme();
  return (
    <OrbitText accessibilityRole="alert" variant="caption" style={{ color: colors.alert }}>
      {message}
    </OrbitText>
  );
};

export const QueryError = ({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}): ReactNode => (
  <Card tone="alert">
    <OrbitText variant="title">Couldn’t load this yet.</OrbitText>
    <OrbitText>
      {message ?? 'Check your connection, then try again. No placeholder records are being shown.'}
    </OrbitText>
    <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={onRetry}>
      <OrbitText variant="label">Try again →</OrbitText>
    </Pressable>
  </Card>
);

export const EmptyState = ({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}): ReactNode => (
  <Card>
    <OrbitText variant="title">{title}</OrbitText>
    <OrbitText>{detail}</OrbitText>
    {action}
  </Card>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmarkText: { letterSpacing: 3 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  eyebrow: { marginBottom: spacing.sm },
  subtitle: { marginTop: spacing.sm, maxWidth: 330 },
  fieldWrap: { gap: spacing.sm },
  field: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    fontFamily: 'InstrumentSans_400Regular',
    fontSize: 16,
  },
  fieldMultiline: { minHeight: 126, paddingTop: spacing.lg, textAlignVertical: 'top' },
  metric: { flex: 1, gap: spacing.xs },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
  },
  pressed: { opacity: 0.55 },
});
