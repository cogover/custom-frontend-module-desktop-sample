import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_URL_DELAY_MS, appFromUrl, appOfHash, clearWindowUrl, searchFromUrl, useWindowUrl, writeWindowUrl } from './url';

const IDS = ['cong-viec', 'ghi-chu', 'cai-dat'];
const at = (url: string) => window.history.replaceState(null, '', url);
const here = () => window.location.pathname + window.location.search + window.location.hash;

afterEach(() => vi.useRealTimers());

describe('URL of the desktop (CONTRACT §9.1)', () => {
  it('knows the app of an item link', () => {
    expect(appOfHash('#/note/N1')).toBe('ghi-chu');
    expect(appOfHash('#/task/T1')).toBe('cong-viec');
    expect(appOfHash('')).toBeNull();
    expect(appOfHash('#/other')).toBeNull();
  });

  it('opens the app of an item link first, then ?app=<slug> (tasks / notes), else Công việc (unknown slugs ignored)', () => {
    expect(appFromUrl(IDS, { search: '', hash: '' })).toBe('cong-viec');
    expect(appFromUrl(IDS, { search: '?app=notes', hash: '' })).toBe('ghi-chu');
    expect(appFromUrl(IDS, { search: '?app=settings', hash: '' })).toBe('cai-dat');
    expect(appFromUrl(IDS, { search: '?app=crm', hash: '' })).toBe('cong-viec');
    expect(appFromUrl(IDS, { search: '?app=ghi-chu', hash: '' })).toBe('cong-viec'); // the slug is English, not the id
    expect(appFromUrl(IDS, { search: '?app=tasks', hash: '#/note/N1' })).toBe('ghi-chu');
    expect(appFromUrl(IDS, { search: '?app=notes', hash: '#/task/T1' })).toBe('cong-viec');
  });

  it('gives the saved search only to the app it belongs to (no ?app= = Công việc)', () => {
    expect(searchFromUrl('ghi-chu', { search: '?app=notes&q=b%C3%A1o%20c%C3%A1o', hash: '' })).toBe('báo cáo');
    expect(searchFromUrl('cong-viec', { search: '?app=notes&q=abc', hash: '' })).toBe('');
    expect(searchFromUrl('cong-viec', { search: '?q=abc', hash: '' })).toBe('abc');
    expect(searchFromUrl('ghi-chu', { search: '?q=abc', hash: '' })).toBe('');
  });

  it('writes the window in front, keeping the other parameters, without a history entry', () => {
    at('/_cm_5/index.html?lang=vi#/task/T1');
    const length = window.history.length;
    writeWindowUrl('ghi-chu', 'a b', '#/note/N1');
    expect(here()).toBe('/_cm_5/index.html?lang=vi&app=notes&q=a+b#/note/N1');
    writeWindowUrl('ghi-chu', '', '');
    expect(here()).toBe('/_cm_5/index.html?lang=vi&app=notes');
    expect(window.history.length).toBe(length);
  });

  it('a closed window leaves the URL only when it is the one there', () => {
    at('/?lang=vi&app=notes&q=x#/note/N1');
    clearWindowUrl('cong-viec');
    expect(here()).toBe('/?lang=vi&app=notes&q=x#/note/N1');
    clearWindowUrl('ghi-chu');
    expect(here()).toBe('/?lang=vi');
    at('/?q=x#/task/T1');
    clearWindowUrl('cong-viec');
    expect(here()).toBe('/');
  });

  it('useWindowUrl: writes only while active, keeps a pending link of its own app, waits for typing to pause', () => {
    vi.useFakeTimers();
    at('/#/task/T1');
    const { rerender } = renderHook((p: { active: boolean; q: string; item: string }) => useWindowUrl(p.active, 'cong-viec', p.q, p.item), {
      initialProps: { active: false, q: '', item: '' },
    });
    expect(here()).toBe('/#/task/T1'); // behind: untouched
    rerender({ active: true, q: '', item: '' });
    expect(here()).toBe('/?app=tasks#/task/T1'); // the task link waits for the tasks to load
    rerender({ active: true, q: '', item: '#/task/T1' });
    at('/?app=tasks'); // the window drops its link when the task closes
    rerender({ active: true, q: 'đi', item: '' });
    expect(here()).toBe('/?app=tasks'); // the task closed; the search is not there yet
    act(() => vi.advanceTimersByTime(SEARCH_URL_DELAY_MS));
    expect(window.location.search).toBe('?app=tasks&q=%C4%91i');

    at('/?app=notes#/note/N1'); // another window was in front
    rerender({ active: false, q: 'đi', item: '' });
    rerender({ active: true, q: 'đi', item: '' });
    expect(here()).toBe('/?app=tasks&q=%C4%91i'); // its note link is not kept
  });
});
