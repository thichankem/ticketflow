import DOMPurify from 'isomorphic-dompurify';

/**
 * Strips dangerous HTML and scripts from strings.
 * Preserves standard safe markup or text.
 */
export function sanitizeString(val) {
  if (typeof val !== 'string') return val;
  let str = val;
  let prev;
  // Recursively strip script/event handler tags to handle nested evasion payloads like <scr<script>ipt>
  do {
    prev = str;
    str = str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/javascript:[^"']*/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/<svg[^>]*>/gi, '')
      .replace(/on\w+\s*=\s*(?:[^\s>]+|"[^"]*"|'[^']*')/gi, '');
  } while (str !== prev);

  return DOMPurify.sanitize(str, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span'],
    ALLOWED_ATTR: ['href', 'title', 'target', 'class'],
  });
}

/**
 * Deep sanitizes objects and arrays recursively
 */
export function sanitizeDeep(data) {
  if (!data || typeof data !== 'object') {
    return typeof data === 'string' ? sanitizeString(data) : data;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeDeep(item));
  }
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    clean[key] = sanitizeDeep(value);
  }
  return clean;
}

export const sanitizerMiddleware = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeDeep(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeDeep(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeDeep(req.params);
  }
  next();
};

export default sanitizerMiddleware;
