export function eventStart(event) {
  return event?.starts_at || event?.start_date || null;
}

export function eventEnd(event) {
  return event?.ends_at || event?.end_date || null;
}

export function formatDate(value) {
  if (!value) return 'Date TBA';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date TBA';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRange(event) {
  const start = formatDateTime(eventStart(event));
  const end = formatDateTime(eventEnd(event));
  if (start && end) return `${start} – ${end}`;
  return start || end || 'Schedule TBA';
}

export function money(cents) {
  if (cents === 0) return 'FREE';
  if (cents == null || Number.isNaN(Number(cents))) return 'N/A';
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

export function startingPrice(tiers) {
  if (!tiers?.length) return null;
  return Math.min(...tiers.map((tier) => Number(tier.price)));
}

export function toneClass(category) {
  const key = String(category || 'tech').toLowerCase();
  const known = ['tech', 'music', 'sports', 'film', 'community', 'business', 'design'];
  return known.includes(key) ? `tone-${key}` : 'tone-tech';
}

export function plainText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
