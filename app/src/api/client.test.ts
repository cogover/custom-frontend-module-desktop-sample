import { describe, expect, it, vi } from 'vitest';
import { headersToObject, jsonResponse } from '../test/fixtures';
import { ApiError, NetworkError, SessionExpiredError, apiPost, buildHeaders, errorMessage, isSessionExpired, readCookie } from './client';

function stubFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const f = vi.fn(impl);
  vi.stubGlobal('fetch', f);
  return f;
}

describe('readCookie', () => {
  it('reads and URL-decodes a cookie by exact name', () => {
    expect(readCookie('XSRF-TOKEN', 'a=1; XSRF-TOKEN=ab%2Bc%3D; X=2')).toBe('ab+c=');
    expect(readCookie('XSRF-TOKEN', 'MY-XSRF-TOKEN=nope')).toBe('');
    expect(readCookie('XSRF-TOKEN', 'XSRF-TOKEN=%E0%A4%A')).toBe('%E0%A4%A');
    expect(readCookie('XSRF-TOKEN', 'novalue; XSRF-TOKEN=t')).toBe('t');
  });

  it('defaults to document.cookie', () => {
    document.cookie = 'XSRF-TOKEN=from-doc; path=/';
    expect(readCookie('XSRF-TOKEN')).toBe('from-doc');
  });
});

describe('buildHeaders', () => {
  it('sends routing headers and the CSRF token from the cookie (never hard-coded)', () => {
    document.cookie = 'XSRF-TOKEN=tok%20123; path=/';
    expect(buildHeaders(217)).toEqual({
      'content-type': 'application/json',
      'x-req-type': '9',
      'x-req-service': '217',
      'x-csrf-token': 'tok 123',
      'x-xsrf-token': 'tok 123',
    });
  });

  it('omits CSRF headers when there is no cookie', () => {
    expect(buildHeaders(218)).not.toHaveProperty('x-csrf-token');
  });
});

describe('apiPost', () => {
  it('POSTs JSON same-origin and resolves with data on r = 0', async () => {
    document.cookie = 'XSRF-TOKEN=abc; path=/';
    const f = stubFetch(async () => jsonResponse({ r: 0, msg: 'ok', data: { id: 'TAS1' } }));
    await expect(apiPost('/api/v1/records', 10200, { a: 1 })).resolves.toEqual({ id: 'TAS1' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/v1/records');
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin', body: '{"a":1}' });
    expect(headersToObject(init?.headers)).toMatchObject({ 'x-req-service': '10200', 'x-req-type': '9', 'x-csrf-token': 'abc', 'x-xsrf-token': 'abc' });
  });

  it('passes keepalive through for page-close deletes', async () => {
    const f = stubFetch(async () => jsonResponse({ r: 0, data: {} }));
    await apiPost('/api/v1/records/delete', 218, {}, { keepalive: true });
    expect(f.mock.calls[0][1]).toMatchObject({ keepalive: true });
  });

  it('throws ApiError with the server message when r ≠ 0', async () => {
    stubFetch(async () => jsonResponse({ r: 27, msg: 'type is required' }));
    const err = await apiPost<never>('/x', 217, {}).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).not.toBeInstanceOf(SessionExpiredError);
    expect(err.message).toBe('type is required');
    expect(err.code).toBe(27);
  });

  it('uses a generic message when r ≠ 0 without msg', async () => {
    stubFetch(async () => jsonResponse({ r: 5 }));
    await expect(apiPost('/x', 217, {})).rejects.toThrow('Thao tác không thành công (mã 5).');
  });

  it.each([401, 403])('turns HTTP %s into SessionExpiredError', async status => {
    stubFetch(async () => jsonResponse({ msg: 'Unauthorized' }, status));
    const err = await apiPost<never>('/x', 217, {}).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(SessionExpiredError);
    expect(isSessionExpired(err)).toBe(true);
    expect(err.status).toBe(status);
  });

  it('treats a proxy auth error and a rejected CSRF token as an expired session', async () => {
    stubFetch(async () => jsonResponse({ r: 1, msg: 'Session expired' }, 400, { 'x-proxy-error': '1' }));
    await expect(apiPost('/x', 217, {})).rejects.toBeInstanceOf(SessionExpiredError);
    stubFetch(async () => jsonResponse({ r: 19000, msg: 'CSRF_TOKEN_NOT_VALID' }));
    await expect(apiPost('/x', 217, {})).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('treats HTTP 400 + r: 19000 (session cookie gone on the reference Workspace) as an expired session', async () => {
    stubFetch(async () => jsonResponse({ r: 19000, msg: 'CSRF_TOKEN_NOT_VALID' }, 400));
    const err = await apiPost<never>('/x', 217, {}).catch((e: unknown) => e as ApiError);
    expect(err).toBeInstanceOf(SessionExpiredError);
    expect(err.status).toBe(400);
    expect(err.code).toBe(19000);
  });

  it('keeps other proxy errors as plain API errors', async () => {
    stubFetch(async () => jsonResponse({ msg: 'Upstream timeout' }, 504, { 'x-proxy-error': '1' }));
    const err = await apiPost<never>('/x', 217, {}).catch((e: unknown) => e as ApiError);
    expect(err).not.toBeInstanceOf(SessionExpiredError);
    expect(err.message).toBe('Upstream timeout');
  });

  it('reports HTTP errors without a JSON body', async () => {
    stubFetch(async () => new Response('<html>oops</html>', { status: 500 }));
    await expect(apiPost('/x', 217, {})).rejects.toThrow('Máy chủ trả lỗi (HTTP 500).');
  });

  it('rejects a 200 response that is not the Cogover envelope', async () => {
    stubFetch(async () => new Response('not json', { status: 200 }));
    await expect(apiPost('/x', 217, {})).rejects.toThrow('Phản hồi từ máy chủ không hợp lệ.');
  });

  it('maps network failures to NetworkError and re-throws aborts', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(apiPost('/x', 217, {})).rejects.toBeInstanceOf(NetworkError);
    const abort = new DOMException('aborted', 'AbortError');
    stubFetch(async () => {
      throw abort;
    });
    await expect(apiPost('/x', 217, {})).rejects.toBe(abort);
  });

  it('formats any error for display', () => {
    expect(errorMessage(new ApiError('A'))).toBe('A');
    expect(errorMessage(new Error('B'))).toBe('B');
    expect(errorMessage('weird')).toBe('Đã xảy ra lỗi không xác định.');
  });
});
