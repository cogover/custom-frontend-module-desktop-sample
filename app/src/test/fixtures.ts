import { vi } from 'vitest';
import { createMockBackend, type MockBackend, type MockBackendOptions } from '../../dev/mock-backend';
import { mockSeed } from '../../dev/mock-seed';
import type { Person, Task } from '../domain/types';

/** Thursday 2026-10-01 10:00 in Vietnam (03:00 UTC). */
export const FIXED_NOW = Date.UTC(2026, 9, 1, 3, 0, 0);
export const ME = 'PERMOCKME0001';

export function freezeTime(now = FIXED_NOW) {
  vi.useFakeTimers({ toFake: ['Date'], now });
}

export function headersToObject(h: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (h instanceof Headers) h.forEach((v, k) => (out[k.toLowerCase()] = v));
  else if (Array.isArray(h)) for (const [k, v] of h) out[k.toLowerCase()] = v;
  else for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  return out;
}

export interface FetchOptions {
  scenario?: string;
  /** Per-path override: return a custom Response. */
  override?: (path: string, body: any, headers: Record<string, string>) => Response | undefined | Promise<Response | undefined>;
}

/** A multipart upload as the mock backend reads it. */
function uploadBody(form: FormData) {
  const file = form.get('file');
  return {
    field_slug: form.get('field_slug'),
    object_slug: form.get('object_slug'),
    field_id: form.get('field_id'),
    object_id: form.get('object_id'),
    file: file instanceof Blob ? { name: (file as File).name, size: file.size, type: file.type } : undefined,
  };
}

/** Routes global fetch to an in-memory Cogover Records API. */
export function installBackend(opts: Partial<MockBackendOptions> = {}, fetchOpts: FetchOptions = {}) {
  const seed = mockSeed(FIXED_NOW);
  const backend: MockBackend = createMockBackend({ ...seed, now: () => Date.now(), ...opts });
  const responses: { path: string; body: any }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = new URL(url, 'http://localhost').pathname;
    const headers = headersToObject(init?.headers);
    const body = init?.body instanceof FormData ? uploadBody(init.body) : init?.body ? JSON.parse(String(init.body)) : null;
    const custom = await fetchOpts.override?.(path, body, headers);
    if (custom) return custom;
    const out = backend.handle({ method: init?.method, path, headers, body, scenario: fetchOpts.scenario });
    responses.push({ path, body: out.body });
    return new Response(JSON.stringify(out.body), {
      status: out.status,
      headers: { 'content-type': 'application/json', ...out.headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { backend, fetchMock, responses };
}

export const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export function person(id: string, firstName = 'An', lastName = 'Trần Minh'): Person {
  return { id, firstName, lastName, avatarUrl: null };
}

export function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'T1',
    code: 'TAS-1',
    subject: 'Việc thử',
    description: '',
    descText: '',
    dueDate: FIXED_NOW + 3600e3,
    priority: 'medium',
    status: 'new',
    reporter: person(ME),
    assignee: person(ME),
    ccs: [],
    attachments: [],
    descImages: [],
    created: FIXED_NOW - 3600e3,
    updated: FIXED_NOW - 3600e3,
    ...overrides,
  };
}
