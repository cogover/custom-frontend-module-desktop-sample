import { useEffect, useState } from 'react';

/**
 * What a refresh must bring back (CONTRACT §9.1): `?app=<slug>&q=<search>#/<item>`. The window in front writes
 * them (replaceState, no history entry); the hash keeps the item links of each app (`#/task/<id>`,
 * `#/note/<id>`), which also work alone.
 */
export const SELF_APP = 'cong-viec';
export const NOTES_APP = 'ghi-chu';
export const SETTINGS_APP = 'cai-dat';
export const DEVTOOLS_APP = 'dev-tools';
/** The English slug of each app in `?app=` (the ids stay those of the dock, `data-front`, test ids). */
export const APP_SLUG: Readonly<Record<string, string>> = { [SELF_APP]: 'tasks', [NOTES_APP]: 'notes', [SETTINGS_APP]: 'settings', [DEVTOOLS_APP]: 'devtools' };
export const APP_PARAM = 'app';
export const SEARCH_PARAM = 'q';
/** The search goes to the URL once typing pauses (Safari refuses more than 100 replaceState calls in 30 s). */
export const SEARCH_URL_DELAY_MS = 400;

type Where = Pick<Location, 'hash' | 'search'>;

/** The app an item link belongs to: `#/note/<id>` → Ghi chú, `#/task/<id>` → Công việc; null for anything else. */
export function appOfHash(hash: string): string | null {
  if (hash.startsWith('#/note/')) return NOTES_APP;
  if (hash.startsWith('#/task/')) return SELF_APP;
  return null;
}

const slugOf = (app: string) => APP_SLUG[app] ?? app;

/** The app the URL's `?app=` belongs to: none = Công việc, an unknown slug = null. */
function urlOwner(search: URLSearchParams): string | null {
  const slug = search.get(APP_PARAM);
  if (slug === null) return SELF_APP;
  return Object.keys(APP_SLUG).find(id => APP_SLUG[id] === slug) ?? null;
}

/** The app `?app=` names, when it is one of `known`; else null. */
function namedApp(known: readonly string[], loc: Where): string | null {
  const search = new URLSearchParams(loc.search);
  const id = search.has(APP_PARAM) ? urlOwner(search) : null;
  return id && known.includes(id) ? id : null;
}

/** The app a page load opens: the app of an item link, else `?app=`, else Công việc. */
export function appFromUrl(known: readonly string[], loc: Where = window.location): string {
  return appOfHash(loc.hash) ?? namedApp(known, loc) ?? SELF_APP;
}

/** The search saved in the URL for `app` ('' when the URL belongs to another app). */
export function searchFromUrl(app: string, loc: Where = window.location): string {
  const params = new URLSearchParams(loc.search);
  return urlOwner(params) === app ? (params.get(SEARCH_PARAM) ?? '') : '';
}

function replaceUrl(search: URLSearchParams, hash: string) {
  const query = search.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${hash}`;
  const now = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (url !== now) window.history.replaceState(window.history.state, '', url);
}

/** Puts the window in front in the URL: `?app=<slug>`, `?q=` (dropped when empty) and its item hash ('' = none). */
export function writeWindowUrl(app: string, query: string, hash: string) {
  const search = new URLSearchParams(window.location.search);
  search.set(APP_PARAM, slugOf(app));
  if (query) search.set(SEARCH_PARAM, query);
  else search.delete(SEARCH_PARAM);
  replaceUrl(search, hash);
}

/** A closed window leaves the URL (a refresh then opens Công việc, as on a first visit). */
export function clearWindowUrl(app: string) {
  const search = new URLSearchParams(window.location.search);
  if (urlOwner(search) !== app) return;
  search.delete(APP_PARAM);
  search.delete(SEARCH_PARAM);
  replaceUrl(search, '');
}

/**
 * Keeps the URL on the window while it is in front (`active`): its id, its search (after a pause) and its open
 * item (`itemHash`, '' for none). With no item open, a link of this app still waiting to be opened (`#/task/…`
 * while the tasks load) stays in place; any other hash is dropped.
 */
export function useWindowUrl(active: boolean, app: string, query: string, itemHash: string) {
  const [settled, setSettled] = useState(query);
  useEffect(() => {
    if (query === settled) return;
    const t = setTimeout(() => setSettled(query), SEARCH_URL_DELAY_MS);
    return () => clearTimeout(t);
  }, [query, settled]);

  useEffect(() => {
    if (!active) return;
    const pending = appOfHash(window.location.hash) === app ? window.location.hash : '';
    writeWindowUrl(app, settled.trim(), itemHash || pending);
  }, [active, app, settled, itemHash]);
}
