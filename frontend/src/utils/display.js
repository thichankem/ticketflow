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

export function eventCoverImage(event) {
  if (event?.cover && typeof event.cover === 'string' && event.cover.trim() && !event.cover.includes('placeholder')) {
    return event.cover;
  }
  if (event?.banner && typeof event.banner === 'string' && event.banner.trim() && !event.banner.includes('placeholder')) {
    return event.banner;
  }
  const cat = String(event?.category || '').toLowerCase();
  if (cat.includes('music')) return '/images/events/jazz.svg';
  if (cat.includes('sport')) return '/images/events/marathon.svg';
  if (cat.includes('film') || cat.includes('cinema')) return '/images/events/film.svg';
  if (cat.includes('community')) return '/images/events/meetup.svg';
  if (cat.includes('business') || cat.includes('pitch') || cat.includes('startup')) return '/images/events/pitch.svg';
  if (cat.includes('design') || cat.includes('workshop') || cat.includes('ux')) return '/images/events/ux.svg';
  if (cat.includes('edm') || cat.includes('night') || cat.includes('party')) return '/images/events/edm.svg';
  return '/images/events/summit.svg';
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
  { id: 'ALL', label: 'Tất cả sự kiện', icon: 'ticket' },
  { id: 'Music', label: 'Nhạc sống & Concert', icon: 'music' },
  { id: 'Design', label: 'Sân khấu & Nghệ thuật', icon: 'design' },
  { id: 'Tech', label: 'Công nghệ & Triển lãm', icon: 'tech' },
  { id: 'Business', label: 'Hội thảo & Workshop', icon: 'business' },
  { id: 'Sports', label: 'Thể thao & Giải trí', icon: 'sports' },
  { id: 'Community', label: 'Tham quan & Trải nghiệm', icon: 'community' },
];
