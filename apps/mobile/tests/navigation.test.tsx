import { fireEvent, render, screen } from '@testing-library/react';
import { router, usePathname } from 'expo-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppBack, MainNavigation, mainDestination } from '../src/navigation';

describe('persistent main navigation and safe back', () => {
  beforeEach(() => {
    vi.mocked(router.navigate).mockClear();
    vi.mocked(router.replace).mockClear();
    vi.mocked(router.back).mockClear();
    vi.mocked(router.canGoBack).mockReturnValue(true);
  });
  it.each(['/catch', '/intents', '/connections', '/groups', '/skill/fixture-id'])(
    'keeps all five destinations on %s',
    (pathname) => {
      vi.mocked(usePathname).mockReturnValue(pathname);
      render(<MainNavigation />);
      for (const label of ['Today', 'Circle', 'Ask', 'Skills', 'You'])
        expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'Today' }));
      expect(router.navigate).toHaveBeenCalledWith('/today');
    },
  );
  it('returns a direct Catch deep link to Today when no history exists', () => {
    vi.mocked(usePathname).mockReturnValue('/catch');
    vi.mocked(router.canGoBack).mockReturnValue(false);
    render(<AppBack />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to previous screen' }));
    expect(router.replace).toHaveBeenCalledWith('/today');
  });
  it('uses real back history when available', () => {
    vi.mocked(usePathname).mockReturnValue('/intents');
    render(<AppBack />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to previous screen' }));
    expect(router.back).toHaveBeenCalledOnce();
    expect(mainDestination('/intents')).toBe('/circle');
    expect(mainDestination('/connections')).toBe('/you');
  });
});
