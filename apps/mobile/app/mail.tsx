import { Screen } from '@orbit/ui';
import { AppHeader } from '@/components';
import { MailPanel } from '@/mail-panel';
export default function Mail() {
  return (
    <Screen>
      <AppHeader
        title="Less inbox. More life."
        subtitle="Replies to prepare, purchases to keep, subscriptions to watch."
      />
      <MailPanel />
    </Screen>
  );
}
