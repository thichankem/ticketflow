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
  const num = Number(cents);
  if (num === 0) return 'FREE';
  if (cents == null || Number.isNaN(num)) return 'N/A';
  // If price is stored in minor units / cents (e.g. 2500 for $25.00), scale down.
  // If already in major units / dollars (e.g. 25.00 or 35), format directly.
  const dollars = num >= 1000 && Number.isInteger(num) ? num / 100 : num;
  return `$${dollars.toFixed(2)}`;
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
