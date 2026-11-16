export function eventStart(event) {
  return event?.starts_at || event?.start_date || null;
}

export function eventEnd(event) {
  return event?.ends_at || event?.end_date || null;
}

export function formatDate(value) {
  if (!value) return 'Chưa có ngày';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa có ngày';
  return date.toLocaleDateString('vi-VN', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatRange(event) {
  const start = formatDateTime(eventStart(event));
  const end = formatDateTime(eventEnd(event));
  if (start && end) return `${start} – ${end}`;
  return start || end || 'Chưa có lịch';
}

export function money(amount, currency = null) {
  const num = Number(amount);
  if (num === 0) return 'MIỄN PHÍ';
  if (amount == null || Number.isNaN(num)) return 'Liên hệ';

  const curr = String(currency || '').toUpperCase();
  if (curr === 'USD') {
    const dollars = num >= 100 && Number.isInteger(num) ? num / 100 : num;
    return `$${dollars.toFixed(2)}`;
  }
  if (curr === 'VND') {
    return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
  }

  // Smart fallback when currency is omitted
  if (num >= 1000) {
    return new Intl.NumberFormat('vi-VN').format(num) + ' ₫';
  }
  const dollars = num >= 100 && Number.isInteger(num) ? num / 100 : num;
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

export const EVENT_CATEGORIES = [
  { id: 'ALL', label: 'Tất cả sự kiện', icon: '🎟️' },
  { id: 'Music', label: 'Nhạc sống & Concert', icon: '🎵' },
  { id: 'Design', label: 'Sân khấu & Nghệ thuật', icon: '🎭' },
  { id: 'Tech', label: 'Công nghệ & Triển lãm', icon: '💻' },
  { id: 'Business', label: 'Hội thảo & Workshop', icon: '📈' },
  { id: 'Sports', label: 'Thể thao & Giải trí', icon: '⚽' },
  { id: 'Community', label: 'Tham quan & Trải nghiệm', icon: '🎡' },
];
