import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { loadSide } from './hooks/useSideRail';
import { renderApp } from './test/app';

const KEY = 'cong-viec.side';
const stored = () => JSON.parse(localStorage.getItem(KEY) ?? 'null');
const board = () => document.querySelector<HTMLElement>('.board')!;
const toggle = () => screen.getByTestId('side-toggle');
const resizer = () => screen.getByTestId('side-resizer');

/** Desktop (≥ 881px) unless `desktop` is false; every other media query does not match. */
function screenSize(desktop = true) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({ matches: desktop && q.includes('min-width: 881px'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
  );
}

describe('left rail: resize and hide (CONTRACT §5 1d)', () => {
  it('ends the title strip with the hide button and puts the resize handle on the rail edge', async () => {
    screenSize();
    await renderApp();
    const side = document.querySelector('.side')!;
    expect(within(side as HTMLElement).getByRole('group', { name: 'Điều khiển cửa sổ' })).toContainElement(toggle());
    expect(toggle()).toHaveAttribute('aria-label', 'Ẩn cột trái');
    expect(toggle()).toHaveAttribute('title', 'Ẩn cột trái (⌘\\)');
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(toggle()).toHaveAttribute('aria-controls', side.id);
    expect(toggle()).toHaveAttribute('aria-keyshortcuts', 'Meta+Backslash Control+Backslash');
    expect(resizer()).toHaveAttribute('role', 'separator');
    expect(resizer()).toHaveAttribute('aria-orientation', 'vertical');
    expect(resizer()).toHaveAccessibleName('Đổi độ rộng cột trái');
    expect(resizer()).toHaveAttribute('aria-controls', side.id);
    expect([resizer().getAttribute('aria-valuemin'), resizer().getAttribute('aria-valuemax'), resizer().getAttribute('aria-valuenow')]).toEqual(['220', '420', '256']);
    expect(board().style.getPropertyValue('--side-w')).toBe('256px');
  });

  it('hides the rail: one column, the window buttons + "Hiện cột trái" move before the search; ⌘\\ / Ctrl+\\ toggle', async () => {
    screenSize();
    const { user } = await renderApp();
    await user.click(toggle());
    expect(document.querySelector('.side')).toBeNull();
    expect(screen.queryByTestId('side-resizer')).toBeNull();
    expect(board()).toHaveAttribute('data-side', 'hidden');
    const lead = document.querySelector('.topbar > .title-ctl')!;
    expect(lead.nextElementSibling).toHaveClass('search');
    expect(lead).toContainElement(toggle());
    expect(toggle()).toHaveAttribute('aria-label', 'Hiện cột trái');
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveFocus(); // the button moved: the focus follows it
    expect(stored()).toEqual({ width: 256, hidden: true });

    fireEvent.keyDown(document.body, { key: '\\', metaKey: true });
    expect(document.querySelector('.side')).not.toBeNull();
    expect(stored()).toEqual({ width: 256, hidden: false });
    fireEvent.keyDown(document.body, { key: '\\', ctrlKey: true });
    expect(document.querySelector('.side')).toBeNull();
    fireEvent.keyDown(document.body, { key: '\\' }); // no modifier: nothing
    expect(document.querySelector('.side')).toBeNull();
  });

  it('resizes from the keyboard (16px, Shift 48px, Home/End) and back to 256px on double-click, saving each time', async () => {
    screenSize();
    await renderApp();
    const now = () => resizer().getAttribute('aria-valuenow');
    fireEvent.keyDown(resizer(), { key: 'ArrowRight' });
    expect(now()).toBe('272');
    expect(board().style.getPropertyValue('--side-w')).toBe('272px');
    expect(stored()).toEqual({ width: 272, hidden: false });
    fireEvent.keyDown(resizer(), { key: 'ArrowLeft', shiftKey: true });
    expect(now()).toBe('224');
    fireEvent.keyDown(resizer(), { key: 'ArrowLeft' });
    expect(now()).toBe('220'); // never below the minimum
    fireEvent.keyDown(resizer(), { key: 'End' });
    expect(now()).toBe('420');
    fireEvent.keyDown(resizer(), { key: 'Home' });
    expect(now()).toBe('220');
    fireEvent.doubleClick(resizer());
    expect(now()).toBe('256');
    expect(stored()).toEqual({ width: 256, hidden: false });
  });

  it('drags the edge: the width follows the pointer and is saved once, on release', async () => {
    screenSize();
    await renderApp();
    fireEvent.pointerDown(resizer(), { button: 0, clientX: 300, pointerId: 1 });
    expect(board()).toHaveAttribute('data-resizing');
    fireEvent.pointerMove(resizer(), { clientX: 400, pointerId: 1 });
    expect(board().style.getPropertyValue('--side-w')).toBe('356px');
    fireEvent.pointerMove(resizer(), { clientX: 900, pointerId: 1 });
    expect(board().style.getPropertyValue('--side-w')).toBe('420px');
    expect(localStorage.getItem(KEY)).toBeNull(); // not while dragging
    fireEvent.pointerMove(resizer(), { clientX: 380, pointerId: 1 });
    fireEvent.pointerUp(resizer(), { clientX: 380, pointerId: 1 });
    expect(board()).not.toHaveAttribute('data-resizing');
    expect(stored()).toEqual({ width: 336, hidden: false });
    expect(resizer()).toHaveAttribute('aria-valuenow', '336');
    // a right click does not start a drag
    fireEvent.pointerDown(resizer(), { button: 2, clientX: 300, pointerId: 2 });
    expect(board()).not.toHaveAttribute('data-resizing');
  });

  it('restores the saved rail, and ignores the hidden state on tablets and phones', async () => {
    screenSize(false);
    localStorage.setItem(KEY, JSON.stringify({ width: 300, hidden: true }));
    await renderApp();
    expect(document.querySelector('.side')).not.toBeNull(); // ≤ 880px: the rail folds to the top as before
    expect(screen.queryByTestId('side-resizer')).toBeNull();
    fireEvent.keyDown(document.body, { key: '\\', metaKey: true });
    expect(stored()).toEqual({ width: 300, hidden: true }); // the shortcut does nothing here
  });

  it('reads odd saved values as the defaults', () => {
    const load = (v: string | null) => {
      if (v === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, v);
      return loadSide();
    };
    expect(load(null)).toEqual({ width: 256, hidden: false });
    expect(load('{"width":null,"hidden":"yes"}')).toEqual({ width: 256, hidden: false }); // Number(null) would be 0
    expect(load('{"width":"300"}')).toEqual({ width: 256, hidden: false });
    expect(load('{"width":999,"hidden":true}')).toEqual({ width: 420, hidden: true });
    expect(load('{"width":100.4}')).toEqual({ width: 220, hidden: false });
    expect(load('not json')).toEqual({ width: 256, hidden: false });
  });
});
