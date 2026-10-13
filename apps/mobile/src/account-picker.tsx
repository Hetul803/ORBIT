import { Pressable, ScrollView } from 'react-native';
import { Pill, spacing } from '@orbit/ui';
import { useLinkedAccounts } from './linked-accounts';
import { accountCaption } from './account-reference';
export const AccountPicker = ({
  selected,
  onChange,
}: {
  selected: string | null;
  onChange: (id: string | null) => void;
}) => {
  const query = useLinkedAccounts();
  const accounts = Array.isArray(query.data) ? query.data.filter((a) => a.status === 'active') : [];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Show all connected accounts"
        accessibilityState={{ selected: selected === null }}
        onPress={() => onChange(null)}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Pill tone={selected === null ? 'yours' : 'neutral'}>All accounts</Pill>
      </Pressable>
      {accounts.map((account) => (
        <Pressable
          key={account.id}
          accessibilityRole="button"
          accessibilityLabel={
            'Show account: ' + accountCaption({ ...account, connectionId: account.id })
          }
          accessibilityState={{ selected: selected === account.id }}
          onPress={() => onChange(account.id)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Pill tone={selected === account.id ? 'yours' : 'neutral'}>
            {accountCaption({ ...account, connectionId: account.id })}
          </Pill>
        </Pressable>
      ))}
    </ScrollView>
  );
};
