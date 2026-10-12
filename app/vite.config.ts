import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Connect, type Plugin } from 'vite';
import { createMockBackend, type MockBackend } from './dev/mock-backend.ts';
import { MOCK_IMAGE_SVG, mockAvatarSvg, mockSeed, mockStatusRule } from './dev/mock-seed.ts';

const MOCK_CSRF = 'mock-csrf-token';

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** multipart/form-data → the fields the mock upload needs (Node's own Request parser). */
async function readUpload(req: IncomingMessage, raw: Buffer) {
  const form = await new Request('http://mock.local/upload', {
    method: 'POST',
    headers: { 'content-type': String(req.headers['content-type'] ?? '') },
    body: raw,
  }).formData();
  const file = form.get('file');
  return {
    field_slug: String(form.get('field_slug') ?? ''),
    object_slug: String(form.get('object_slug') ?? ''),
    field_id: String(form.get('field_id') ?? ''),
    object_id: String(form.get('object_id') ?? ''),
    file:
      file && typeof file === 'object'
        ? { name: (file as File).name, size: file.size, type: file.type, data: new Uint8Array(await file.arrayBuffer()) }
        : undefined,
  };
}

function cookieValue(header: string | undefined, name: string): string {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return '';
}

/**
 * DEV/PREVIEW ONLY: answers /api/v1/records*, the attachment upload and /files/<id>/original/*?redirect=true with
 * fictitious data so the UI can be exercised
 * without a Cogover session. Disabled for `vite build` (apply: 'serve'), under Vitest and with
 * COGOVER_DEV_MOCK=0. Scenarios via cookie `cv-mock` (error | expired | csrf | slow | empty);
 * POST/GET /__mock/reset restores the seed data.
 */
function devMockApi(): Plugin {
  let backend: MockBackend | null = null;
  const reset = () => {
    const seed = mockSeed(Date.now());
    // the dev server mirrors the Workspace's status workflow (unit tests turn it on per test)
    backend = createMockBackend({ ...seed, transitionRules: [mockStatusRule()], csrfToken: MOCK_CSRF });
  };

  const middleware: Connect.NextHandleFunction = async (req, res: ServerResponse, next) => {
    if (!backend) reset();
    const url = new URL(req.url ?? '/', 'http://mock.local');
    const path = url.pathname;
    if (!cookieValue(req.headers.cookie, 'XSRF-TOKEN')) {
      res.setHeader('set-cookie', `XSRF-TOKEN=${MOCK_CSRF}; Path=/; SameSite=Lax`);
    }
    if (path === '/__mock/reset') {
      reset();
      res.statusCode = 204;
      res.end();
      return;
    }
    if (path.startsWith('/__mock/avatar/')) {
      res.setHeader('content-type', 'image/svg+xml');
      res.end(mockAvatarSvg(path));
      return;
    }
    if (path === '/__mock/image.svg') {
      res.setHeader('content-type', 'image/svg+xml');
      res.end(MOCK_IMAGE_SVG);
      return;
    }
    // /files/<id>/original/<name> (attachment_files) and /files/0/<id>/<size>/<name> (pictures, public)
    const fileMatch = /^\/files\/(?:0\/([^/]+)\/[a-z]+|([^/]+)\/original)\/[^/]+$/.exec(path);
    if (fileMatch && req.method === 'GET') {
      const fileId = decodeURIComponent(fileMatch[1] ?? fileMatch[2]);
      const f = backend!.state.files.get(fileId);
      if (!f) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      // like the real file server: the file itself only with ?redirect=true, otherwise a JSON pointer
      if (url.searchParams.get('redirect') !== 'true') {
        res.setHeader('content-type', 'text/plain; charset=utf-8');
        res.end(JSON.stringify({ url: `${url.origin}/__mock/signed/${fileId}` }));
        return;
      }
      res.setHeader('content-type', 'application/octet-stream');
      res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`);
      res.end(f.data ? Buffer.from(f.data) : '');
      return;
    }
    const isUpload = path === '/api/v1/file/upload/v2/client_upload';
    const isRule = path === '/api/v1/object_security/transition_rule';
    if (!path.startsWith('/api/v1/records') && !isUpload && !isRule) {
      next();
      return;
    }
    const raw = await readBody(req);
    let body: unknown = null;
    try {
      body = isUpload ? await readUpload(req, raw) : raw.length ? JSON.parse(raw.toString('utf8')) : null;
    } catch {
      body = null;
    }
    const scenario = cookieValue(req.headers.cookie, 'cv-mock') || url.searchParams.get('mock') || undefined;
    if (scenario === 'slow') await new Promise(r => setTimeout(r, 1500));
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : v;
    const out = backend!.handle({ method: req.method, path, headers, body, scenario });
    res.statusCode = out.status;
    for (const [k, v] of Object.entries(out.headers)) res.setHeader(k, v);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(out.body));
  };

  return {
    name: 'cong-viec-dev-mock-api',
    apply: (_config, env) => env.command === 'serve' && !process.env.VITEST && process.env.COGOVER_DEV_MOCK !== '0',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  // served under the module's slug slot (e.g. /_cm_5/), so every asset URL must be relative
  base: './',
  plugins: [react(), tailwindcss(), devMockApi()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true,
  },
});
