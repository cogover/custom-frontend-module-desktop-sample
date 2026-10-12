import { test as base, expect } from '@playwright/test';
import { PageGuard } from '../guard';
import { TaskApp } from '../ui';
import { makePng } from '../files';
import { defaultActivities, defaultDataset, FIXED_NOW, NOTE_IMAGE, P } from './dataset';
import { MOCK_MARK_HEADER, MockCogover } from './mock-api';

export const LOCAL_URL = (process.env.E2E_LOCAL_URL ?? 'http://localhost:4317').replace(/\/$/, '');
const LOCAL_ORIGIN = new URL(LOCAL_URL).origin;
const LOCAL_APP_PATH = process.env.E2E_LOCAL_APP_PATH ?? '/';

/** PNG 1×1 cho avatar (route thay cho file thật trên Workspace). */
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

type LocalFixtures = {
  /** "Bây giờ" của trình duyệt (page.clock.install, thời gian vẫn chạy). */
  now: number;
  /**
   * Quy trình trạng thái của Workspace giả lập (CONTRACT mục 4 "Quy trình trạng thái"):
   * 'workspace' = rule "Status" như Workspace thật (mặc định), 'none' = không có rule (GET rỗng, server không chặn),
   * 'forbidden' = GET rule bị 403 và server không chặn.
   */
  transitionRule: 'workspace' | 'none' | 'forbidden';
  /** Có cài đồng hồ giả hay không. */
  installClock: boolean;
  mock: MockCogover;
  guard: PageGuard;
  app: TaskApp;
};

export const test = base.extend<LocalFixtures>({
  now: [FIXED_NOW, { option: true }],
  transitionRule: ['workspace', { option: true }],
  installClock: [true, { option: true }],

  mock: async ({ context, now, transitionRule }, use) => {
    const mock = new MockCogover(defaultDataset(), now);
    if (transitionRule !== 'workspace') mock.statusFlows = null;
    mock.ruleReadForbidden = transitionRule === 'forbidden';
    mock.createDefaults = { ccs: [P.HOA], project: 'PRJMOCKDEFAULT' };
    await mock.install(context, LOCAL_URL);
    // Timeline mẫu (CONTRACT 3c): cần origin + kho file của mock nên nạp sau install.
    mock.setActivities(defaultActivities(mock, makePng(NOTE_IMAGE.width, NOTE_IMAGE.height, 11)));
    // Avatar tuyệt đối tới Workspace → trả ảnh giả, không gọi mạng thật.
    await context.route('https://acme.cogover.example/files/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: PNG_1x1 }),
    );
    // Mọi host ngoài khác: chặn (guard sẽ ghi nhận external-request).
    await context.route(
      (url) => url.origin !== LOCAL_ORIGIN && url.origin !== 'https://acme.cogover.example' && url.protocol.startsWith('http'),
      (route) => route.abort('blockedbyclient'),
    );
    await use(mock);
    // Request tĩnh còn treo lúc test kết thúc (ví dụ prefetch editor) → "route.fetch: Test ended." → bỏ qua lỗi route đang chạy.
    await context.unrouteAll({ behavior: 'ignoreErrors' });
  },

  guard: [
    async ({ page }, use, testInfo) => {
      const guard = new PageGuard(page, [LOCAL_ORIGIN, 'https://acme.cogover.example']);
      await use(guard);
      const bad = guard.unexpected();
      if (bad.length) await testInfo.attach('console-network-errors', { body: bad.join('\n'), contentType: 'text/plain' });
      expect.soft(bad, 'Lỗi console/network ngoài dự kiến (AC1)').toEqual([]);
    },
    { auto: true },
  ],

  app: async ({ page, context, mock, now, installClock }, use, testInfo) => {
    if (installClock) await page.clock.install({ time: now });
    // Chứng minh mọi request API đi qua mock của test (không lọt sang mock dev của vite preview).
    const bypassed: string[] = [];
    page.on('request', (req) => {
      const u = new URL(req.url());
      if (u.origin === LOCAL_ORIGIN && u.pathname.startsWith('/__mock')) bypassed.push(`gọi mock dev: ${req.method()} ${u.pathname}`);
    });
    page.on('response', (res) => {
      const u = new URL(res.url());
      if (u.origin === LOCAL_ORIGIN && u.pathname.startsWith('/api/') && res.headers()[MOCK_MARK_HEADER] !== '1')
        bypassed.push(`response không từ mock E2E: ${res.request().method()} ${u.pathname} (HTTP ${res.status()})`);
    });
    await use(new TaskApp(page, LOCAL_APP_PATH));
    const xsrf = (await context.cookies(LOCAL_URL)).find((c) => c.name === 'XSRF-TOKEN')?.value;
    if (xsrf !== mock.xsrf) bypassed.push('cookie XSRF-TOKEN bị ghi đè (không còn là token của test)');
    if (mock.violations.length)
      await testInfo.attach('mock-contract-violations', { body: mock.violations.join('\n'), contentType: 'text/plain' });
    expect.soft(bypassed, 'request API phải đi qua mock E2E').toEqual([]);
  },
});

export { expect };
