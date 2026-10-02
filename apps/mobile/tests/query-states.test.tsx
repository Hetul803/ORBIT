import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EmptyState, QueryError } from '../src/components';

const queryScreens = [
  '(tabs)/circle.tsx',
  '(tabs)/skills.tsx',
  '(tabs)/today.tsx',
  '(tabs)/you.tsx',
  'activity.tsx',
  'admin.tsx',
  'connections.tsx',
  'exchange.tsx',
  'exchange/item/[id].tsx',
  'group/[id].tsx',
  'groups.tsx',
  'inbox.tsx',
  'intents.tsx',
  'introduction/[id].tsx',
  'memory.tsx',
  'run/[id].tsx',
  'screening.tsx',
  'settings.tsx',
  'skill/[id].tsx',
  'trust.tsx',
  'watcher/[id].tsx',
  'watchers.tsx',
] as const;

describe('honest query states', () => {
  it('renders an actionable error without records', () => {
    const retry = vi.fn();
    render(<QueryError message="API offline" onRetry={retry} />);
    expect(screen.getByText('API offline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders an explicit empty state', () => {
    render(<EmptyState title="Nothing here." detail="No placeholder records are shown." />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
    expect(screen.getByText('No placeholder records are shown.')).toBeInTheDocument();
  });

  it.each(queryScreens)('%s has a visible QueryError path', (relativePath) => {
    const source = readFileSync(resolve(process.cwd(), 'app', relativePath), 'utf8');
    expect(source).toContain('QueryError');
    expect(source).not.toMatch(/demo|fallbackData|placeholderData/iu);
  });
});
