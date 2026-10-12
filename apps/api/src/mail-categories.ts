export const mailCategories = [
  'important',
  'spam',
  'promotions',
  'social',
  'updates',
  'sent',
  'other',
] as const;
export type MailCategory = (typeof mailCategories)[number];

/** Read-only categorization from Google's existing labels, never a mailbox mutation or model guess. */
export const categoryForLabels = (labels: readonly string[], outbound: boolean): MailCategory => {
  if (labels.includes('SPAM')) return 'spam';
  if (outbound || labels.includes('SENT')) return 'sent';
  if (labels.includes('IMPORTANT') || labels.includes('STARRED')) return 'important';
  if (labels.includes('CATEGORY_PROMOTIONS')) return 'promotions';
  if (labels.includes('CATEGORY_SOCIAL')) return 'social';
  if (labels.includes('CATEGORY_UPDATES')) return 'updates';
  return 'other';
};
