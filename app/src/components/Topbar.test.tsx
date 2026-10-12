import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SHORTCUTS, Topbar } from './Topbar';

const setup = () => {
  const onToggleTheme = vi.fn();
  render(
    <Topbar query="" onQuery={() => {}} searchRef={createRef()} theme="light" onToggleTheme={onToggleTheme} onCreate={() => {}} />,
  );
  return { user: userEvent.setup(), onToggleTheme };
};

describe('Topbar help menu', () => {
  it('sits right before the theme button', () => {
    setup();
    const help = screen.getByTestId('help-toggle');
    expect(help).toHaveAccessibleName('Trợ giúp');
    expect(help).toHaveAttribute('title', 'Phím tắt');
    expect(help).toHaveAttribute('aria-expanded', 'false');
    expect(help.nextElementSibling).toBe(screen.getByTestId('theme-toggle'));
  });

  it('opens a "Phím tắt" popover listing every shortcut, closes with Esc and returns focus', async () => {
    const { user } = setup();
    const help = screen.getByTestId('help-toggle');
    await user.click(help);
    const menu = await screen.findByTestId('help-menu');
    expect(help).toHaveAttribute('aria-expanded', 'true');
    expect(within(menu).getByText('Phím tắt')).toBeInTheDocument();
    const rows = within(menu).getAllByRole('listitem');
    expect(rows.map(r => [r.querySelector('kbd')?.textContent, r.textContent?.replace(r.querySelector('kbd')!.textContent!, '')])).toEqual(SHORTCUTS);
    expect(SHORTCUTS.map(s => s[0])).toEqual(['N', '/', 'T', '⌘\\', 'Esc', '2×']);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByTestId('help-menu')).toBeNull());
    await waitFor(() => expect(help).toHaveFocus());
    expect(help).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles with the button and closes on an outside click', async () => {
    const { user } = setup();
    const help = screen.getByTestId('help-toggle');
    await user.click(help);
    expect(await screen.findByTestId('help-menu')).toBeInTheDocument();
    await user.click(help);
    await waitFor(() => expect(screen.queryByTestId('help-menu')).toBeNull());
    await user.click(help);
    expect(await screen.findByTestId('help-menu')).toBeInTheDocument();
    await user.click(screen.getByRole('searchbox', { name: 'Tìm công việc' }));
    await waitFor(() => expect(screen.queryByTestId('help-menu')).toBeNull());
  });
});
