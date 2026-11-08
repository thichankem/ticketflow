/**
 * Input sanitization middleware for XSS prevention.
 * Uses strict HTML tag & attribute allowlisting without heavy jsdom dependencies,
 * ensuring seamless execution in Node.js, Vercel Serverless Functions, and edge runtimes.
 */

const ALLOWED_TAGS = new Set([
  'b', 'i', 'em', 'strong', 'a', 'p', 'br',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span'
]);

const ALLOWED_ATTRS = new Set(['href', 'title', 'target', 'class']);

export function sanitizeString(val) {
  if (typeof val !== 'string') return val;
  let str = val;
  let prev;

  // Recursively strip script/iframe/object/embed/svg/event handlers
  do {
    prev = str;
    str = str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
      .replace(/javascript:[^"'\s]*/gi, '')
      .replace(/<img[^>]*>/gi, '')
      .replace(/on\w+\s*=\s*(?:[^\s>]+|"[^"]*"|'[^']*')/gi, '');
  } while (str !== prev);

  // Strip any tag not in ALLOWED_TAGS and filter attributes
  str = str.replace(/<\/?([a-zA-Z0-9]+)\b([^>]*)>/gi, (match, tag, rawAttrs) => {
    const lowerTag = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lowerTag)) {
      return '';
    }
    if (match.startsWith('</')) {
      return `</${lowerTag}>`;
    }

    const cleanAttrs = [];
    if (rawAttrs) {
      const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
      let m;
      while ((m = attrRegex.exec(rawAttrs)) !== null) {
        const attrName = m[1].toLowerCase();
        const attrVal = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : m[4]);
        if (ALLOWED_ATTRS.has(attrName)) {
          if (attrName === 'href' && /^\s*javascript:/i.test(attrVal)) {
            continue;
          }
          cleanAttrs.push(`${attrName}="${attrVal.replace(/"/g, '&quot;')}"`);
        }
      }
    }

    return cleanAttrs.length > 0 ? `<${lowerTag} ${cleanAttrs.join(' ')}>` : `<${lowerTag}>`;
  });

  return str;
}

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
