import DOMPurify from 'dompurify';
import { MENTION_STYLE } from './mentions';

const MENTION_ATTRS = ['data-id', 'data-parent-object-id', 'data-parent-record-id', 'data-redirect', 'data-mentioned'];
const isMention = (node: Element) => node.tagName === 'SPAN' && node.getAttribute('data-autocomplete-type') === 'mention' && !!node.getAttribute('data-id');

let hooked = false;

function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', node => {
    if (node.tagName === 'A' && node.hasAttribute('href')) {
      // links in descriptions always open in a new tab, without access back to this page
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') node.setAttribute('loading', 'lazy');
    // only an @mention keeps its marker (drawn as a pill by our CSS, not by its inline style)
    // (its data-id is already gone here: display needs only the marker)
    if (node.hasAttribute?.('data-autocomplete-type') && (node.tagName !== 'SPAN' || node.getAttribute('data-autocomplete-type') !== 'mention')) {
      node.removeAttribute('data-autocomplete-type');
    }
  });
}

/**
 * Sanitises description HTML for display: basic formatting, images, tables and links stay;
 * scripts, event handlers, inline styles, forms and frames are removed.
 */
export function sanitizeDescription(html: string): string {
  if (!html) return '';
  ensureHooks();
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['style', 'id', 'name', 'class', 'srcset'],
    ADD_ATTR: ['data-autocomplete-type'],
    ALLOW_DATA_ATTR: false,
  });
}

let saver: ReturnType<typeof DOMPurify> | null = null;

/**
 * Last line of defence before a description is sent to Cogover: only the tags and attributes the
 * editor writes (CONTRACT §5.3) survive; links keep http/https/mailto and open in a new tab.
 */
export function sanitizeForSave(html: string): string {
  if (!html) return '';
  if (!saver) {
    saver = DOMPurify(window); // own instance: the display hooks (lazy images…) must not apply here
    saver.addHook('afterSanitizeAttributes', node => {
      if (node.tagName === 'A') {
        const href = node.getAttribute('href') ?? '';
        if (!/^(https?:\/\/|mailto:)/i.test(href)) node.removeAttribute('href');
        else {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      }
      // the @mention span keeps exactly the attributes Cogover's editor writes; nothing else keeps any of them
      if (isMention(node)) {
        node.setAttribute('contenteditable', 'false');
        node.setAttribute('data-type', 'autocomplete');
        node.setAttribute('style', MENTION_STYLE);
        if (!(node.getAttribute('data-redirect') ?? '').startsWith('/o/')) node.removeAttribute('data-redirect');
        if (node.hasAttribute('data-mentioned') && node.getAttribute('data-mentioned') !== 'true') node.removeAttribute('data-mentioned');
      } else {
        for (const a of ['style', 'contenteditable', 'data-type', 'data-autocomplete-type', ...MENTION_ATTRS]) node.removeAttribute(a);
      }
    });
  }
  const body = saver.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'code', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'contenteditable', 'style', 'data-type', 'data-autocomplete-type', ...MENTION_ATTRS],
    ALLOW_DATA_ATTR: false,
    RETURN_DOM: true,
  }) as HTMLElement;
  // <span> is only for mentions: any other one is unwrapped (its text stays)
  for (const span of Array.from(body.querySelectorAll('span'))) if (!isMention(span)) span.replaceWith(...Array.from(span.childNodes));
  return body.innerHTML;
}
