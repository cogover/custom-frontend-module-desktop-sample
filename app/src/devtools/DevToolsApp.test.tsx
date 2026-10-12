import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DevToolsApp from './DevToolsApp';
import { DEVTOOLS_STORAGE_KEY } from './devtoolsConfig';

const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });

describe('Dev tools window', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('has four tools; the JSON formatter shows the coloured result or where the JSON breaks', async () => {
    const user = userEvent.setup();
    render(<DevToolsApp />);
    expect(['json', 'markdown', 'jwt', 'base64'].map(id => screen.getByTestId(`devtools-nav-${id}`).textContent)).toEqual(['JSON', 'Markdown', 'JWT', 'Base64']);
    expect(screen.getByTestId('devtools-title')).toHaveTextContent('Format & beautify JSON');
    type('json-input', '{"a":[1,true,null,"x"]}');
    const out = screen.getByTestId('json-output');
    expect(out.textContent).toBe('{\n    "a": [\n        1,\n        true,\n        null,\n        "x"\n    ]\n}'); // 4 spaces by default
    expect(out.querySelector('.j-key')).toHaveTextContent('"a"');
    expect(out.querySelectorAll('.j-num, .j-bool, .j-null, .j-str')).toHaveLength(4);
    type('json-input', '{"a":}');
    expect(screen.getByTestId('json-error')).toHaveTextContent('JSON không hợp lệ');
    expect(screen.queryByTestId('json-output')).toBeNull();
    await user.click(screen.getByTestId('json-sample'));
    expect(screen.getByTestId('json-output')).toHaveTextContent('"TAS-1005"');
    await user.click(screen.getByTestId('json-clear'));
    expect(screen.getByTestId('json-input')).toHaveValue('');
  });

  it('renders Markdown safely, keeps each tool’s text when switching, and remembers the tool', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<DevToolsApp />);
    type('json-input', '[1]');
    await user.click(screen.getByTestId('devtools-nav-markdown'));
    expect(screen.getByTestId('devtools-tool-json')).not.toBeVisible();
    type('markdown-input', '# Chào\n\n**đậm** <script>alert(1)</script>\n\n- a\n- b');
    const md = screen.getByTestId('markdown-output');
    expect(md.querySelector('h1')).toHaveTextContent('Chào');
    expect(md.querySelector('strong')).toHaveTextContent('đậm');
    expect(md.querySelectorAll('li')).toHaveLength(2);
    expect(md.innerHTML).not.toContain('<script');
    await user.click(screen.getByTestId('devtools-nav-json'));
    expect(screen.getByTestId('json-input')).toHaveValue('[1]');
    await user.click(screen.getByTestId('devtools-nav-base64'));
    expect(window.localStorage.getItem(DEVTOOLS_STORAGE_KEY)).toBe('base64');
    unmount();
    render(<DevToolsApp />);
    expect(screen.getByTestId('devtools-title')).toHaveTextContent('Base64 decoder / encoder');
  });

  it('hides and shows its left rail like the other windows; hidden: the tools are tabs in the title bar', async () => {
    // desktop width (the rail only folds away on ≥ 881px)
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) => ({ matches: q.includes('min-width: 881px'), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();
    render(<DevToolsApp />);
    type('json-input', '[1]');
    await user.click(screen.getByTestId('side-toggle'));
    expect(screen.queryByTestId('devtools-nav-json')).toBeNull();
    expect(screen.getByTestId('side-toggle')).toHaveAccessibleName('Hiện cột trái');
    expect(JSON.parse(window.localStorage.getItem('cong-viec.devtools.side')!)).toMatchObject({ hidden: true });
    await user.click(screen.getByTestId('devtools-tab-base64'));
    expect(screen.getByTestId('devtools-title')).toHaveTextContent('Base64 decoder / encoder');
    expect(screen.getByTestId('devtools-tab-base64')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('side-toggle'));
    expect(screen.getByTestId('devtools-nav-base64')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('devtools-tab-json')).toBeNull();
    expect(screen.getByTestId('json-input')).toHaveValue('[1]'); // what was typed stays
  });

  it('encodes and decodes Base64, swaps direction, and copies the result', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<DevToolsApp />);
    await user.click(screen.getByTestId('devtools-nav-base64'));
    type('base64-input', '??>> Việt');
    expect(screen.getByTestId('base64-output')).toHaveTextContent('Pz8+PiBWaeG7h3Q=');
    await user.click(screen.getByTestId('base64-urlsafe'));
    expect(screen.getByTestId('base64-output')).toHaveTextContent('Pz8-PiBWaeG7h3Q');
    await user.click(screen.getByTestId('base64-copy'));
    expect(writeText).toHaveBeenCalledWith('Pz8-PiBWaeG7h3Q');
    await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent('Đã sao chép'));
    await user.click(screen.getByTestId('base64-swap'));
    expect(screen.getByTestId('base64-mode')).toHaveAttribute('data-value', 'decode');
    expect(screen.getByTestId('base64-output')).toHaveTextContent('??>> Việt');
    type('base64-input', '@@');
    expect(screen.getByTestId('base64-error')).toHaveTextContent('không phải Base64');
  });

  it('decodes a JWT, checks its signature with the secret, and signs a new token', async () => {
    const user = userEvent.setup();
    render(<DevToolsApp />);
    await user.click(screen.getByTestId('devtools-nav-jwt'));
    await user.click(screen.getByTestId('jwt-sample'));
    await waitFor(() => expect(screen.getByTestId('jwt-payload')).toHaveTextContent('"name": "Trần Minh An"'));
    expect(screen.getByTestId('jwt-header')).toHaveTextContent('"alg": "HS256"');
    expect(screen.getByTestId('jwt-state')).toHaveTextContent('Còn hiệu lực');
    expect(screen.getByTestId('jwt-times')).toHaveTextContent('Hết hạn lúc (exp)');
    await waitFor(() => expect(screen.getByTestId('jwt-check')).toHaveAttribute('data-check', 'valid'));
    type('jwt-secret', 'sai');
    await waitFor(() => expect(screen.getByTestId('jwt-check')).toHaveAttribute('data-check', 'invalid'));
    type('jwt-input', 'khong.phai');
    expect(screen.getByTestId('jwt-error')).toHaveTextContent('3 phần');

    await user.click(screen.getByTestId('jwt-mode-encode'));
    expect(screen.queryByTestId('jwt-token')).toBeNull(); // no secret yet
    type('jwt-sign-secret', 'abc');
    await waitFor(() => expect(screen.getByTestId('jwt-token').textContent!.split('.')).toHaveLength(3));
    type('jwt-payload-input', '{oops');
    expect(screen.getByTestId('jwt-encode-error')).toHaveTextContent('Payload không phải JSON hợp lệ');
  });
});
