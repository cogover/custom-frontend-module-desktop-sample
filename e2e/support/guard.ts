import type { Page, Request } from '@playwright/test';

/**
 * Bắt lỗi console / pageerror / request lỗi / request ra ngoài origin được phép (AC1).
 * Không ghi header, cookie hay body — chỉ method, URL (bỏ query) và mã lỗi.
 */
export class PageGuard {
  private readonly events: string[] = [];
  private readonly allowList: RegExp[] = [/favicon\.ico/, /net::ERR_ABORTED/];
  readonly requests: { url: string; method: string; resourceType: string }[] = [];

  constructor(
    page: Page,
    private readonly allowedOrigins: (string | RegExp)[],
  ) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const loc = msg.location();
        this.events.push(`console.error: ${msg.text().slice(0, 500)}${loc.url ? ` @ ${stripQuery(loc.url)}` : ''}`);
      }
    });
    page.on('pageerror', (err) => this.events.push(`pageerror: ${err.message.slice(0, 500)}`));
    page.on('requestfailed', (req) =>
      this.events.push(`requestfailed: ${req.method()} ${stripQuery(req.url())} ${req.failure()?.errorText ?? ''}`),
    );
    page.on('response', (res) => {
      if (res.status() >= 400) this.events.push(`HTTP ${res.status()}: ${res.request().method()} ${stripQuery(res.url())}`);
    });
    page.on('request', (req: Request) => {
      const url = req.url();
      this.requests.push({ url, method: req.method(), resourceType: req.resourceType() });
      if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return;
      let origin: string;
      try {
        origin = new URL(url).origin;
      } catch {
        return;
      }
      const ok = this.allowedOrigins.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));
      if (!ok) this.events.push(`external-request: ${req.method()} ${stripQuery(url)}`);
    });
  }

  /** Cho phép một nhóm lỗi dự kiến trong test hiện tại. */
  allow(...patterns: RegExp[]) {
    this.allowList.push(...patterns);
  }

  all() {
    return [...this.events];
  }

  unexpected() {
    return this.events.filter((e) => !this.allowList.some((re) => re.test(e)));
  }
}

export const stripQuery = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split('?')[0];
  }
};
