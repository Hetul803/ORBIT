import { OrbitText, Pill } from '@orbit/ui';
import { View } from 'react-native';
export interface AccountReference {
  provider?: 'google' | 'microsoft';
  accountEmail?: string | null;
  connectionId?: string | null;
}
export const accountCaption = (account: AccountReference): string =>
  `${account.provider === 'microsoft' ? 'Microsoft' : account.provider === 'google' ? 'Google' : 'Synced account'} · ${account.accountEmail ?? 'Account identity unavailable'}${account.connectionId ? ' · ' + account.connectionId.slice(-4) : ''}`;
export const AccountBadge = ({ account }: { account: AccountReference }) => (
  <View accessibilityLabel={'Source account: ' + accountCaption(account)}>
    <Pill>
      {account.provider === 'microsoft'
        ? 'MICROSOFT'
        : account.provider === 'google'
          ? 'GOOGLE'
          : 'SYNCED SOURCE'}
    </Pill>
    <OrbitText variant="caption">{accountCaption(account)}</OrbitText>
  </View>
);
