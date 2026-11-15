/**
 * Location & Distance Utilities for Vietnam Provinces & Cities
 * Integrates with /api/location/* with reliable client-side distance matrix & lookup fallback.
 */

export const VIETNAM_PROVINCES = [
  { name: 'Hà Nội', code: 'HN', lat: 21.0285, lng: 105.8542, aliases: ['hanoi', 'ha noi', 'hn'] },
  { name: 'TP. Hồ Chí Minh', code: 'HCM', lat: 10.8231, lng: 106.6297, aliases: ['tp hcm', 'hcm', 'ho chi minh', 'saigon', 'sai gon'] },
  { name: 'Đà Nẵng', code: 'DN', lat: 16.0544, lng: 108.2022, aliases: ['da nang', 'danang', 'dn'] },
  { name: 'Hải Phòng', code: 'HP', lat: 20.8449, lng: 106.6881, aliases: ['hai phong', 'haiphong', 'hp'] },
  { name: 'Cần Thơ', code: 'CT', lat: 10.0452, lng: 105.7469, aliases: ['can tho', 'cantho', 'ct'] },
  { name: 'Khánh Hòa', code: 'KH', lat: 12.2388, lng: 109.1967, aliases: ['khanh hoa', 'nha trang', 'nhatrang'] },
  { name: 'Lâm Đồng', code: 'LD', lat: 11.9404, lng: 108.4583, aliases: ['lam dong', 'da lat', 'dalat'] },
  { name: 'Quảng Ninh', code: 'QN', lat: 20.9505, lng: 107.0734, aliases: ['quang ninh', 'ha long', 'halong'] },
  { name: 'Thừa Thiên Huế', code: 'HUE', lat: 16.4637, lng: 107.5909, aliases: ['hue', 'thua thien hue'] },
  { name: 'Bà Rịa - Vũng Tàu', code: 'VT', lat: 10.3460, lng: 107.0843, aliases: ['vung tau', 'vungtau', 'ba ria'] },
  { name: 'Bình Dương', code: 'BD', lat: 10.9805, lng: 106.6519, aliases: ['binh duong', 'thu dau mot'] },
  { name: 'Đồng Nai', code: 'DNA', lat: 10.9574, lng: 106.8427, aliases: ['dong nai', 'bien hoa'] },
  { name: 'Kiên Giang', code: 'KG', lat: 10.0125, lng: 105.0809, aliases: ['kien giang', 'phu quoc', 'rach gia'] },
  { name: 'Quảng Nam', code: 'QNA', lat: 15.5684, lng: 108.4755, aliases: ['quang nam', 'hoi an', 'tam ky'] },
  { name: 'Bình Định', code: 'BDI', lat: 13.7820, lng: 109.2197, aliases: ['binh dinh', 'quy nhon'] },
  { name: 'Nghệ An', code: 'NA', lat: 18.6738, lng: 105.6813, aliases: ['nghe an', 'vinh'] },
  { name: 'Thanh Hóa', code: 'TH', lat: 19.8067, lng: 105.7852, aliases: ['thanh hoa', 'sam son'] },
  { name: 'Bắc Ninh', code: 'BN', lat: 21.1861, lng: 106.0763, aliases: ['bac ninh'] },
  { name: 'Hải Dương', code: 'HD', lat: 20.9373, lng: 106.3150, aliases: ['hai duong'] },
  { name: 'Nam Định', code: 'ND', lat: 20.4344, lng: 106.1773, aliases: ['nam dinh'] },
  { name: 'Thái Nguyên', code: 'TN', lat: 21.5942, lng: 105.8482, aliases: ['thai nguyen'] },
  { name: 'Đắk Lắk', code: 'DL', lat: 12.6667, lng: 108.0383, aliases: ['dak lak', 'buon ma thuot'] },
  { name: 'An Giang', code: 'AG', lat: 10.3759, lng: 105.4185, aliases: ['an giang', 'long xuyen'] },
];

/**
 * Remove Vietnamese accents and convert to lower case for fuzzy matching.
 */
function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .trim();
}

/**
 * Identify province from an arbitrary text/address string.
 */
export function matchProvince(locationText) {
  if (!locationText) return null;
  const normalized = normalizeText(locationText);

  for (const prov of VIETNAM_PROVINCES) {
    const provNorm = normalizeText(prov.name);
    if (normalized.includes(provNorm)) return prov;
    for (const alias of prov.aliases) {
      if (normalized.includes(alias)) return prov;
    }
  }
  return null;
}

/**
 * Compute Haversine distance in kilometers between two geo-coordinates.
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Compute distance between two province names or address strings.
 */
export function getDistanceInfo(userProvinceName, eventLocation) {
  if (!userProvinceName || !eventLocation) {
    return null;
  }

  const userProv = matchProvince(userProvinceName) || VIETNAM_PROVINCES.find(p => p.name === userProvinceName);
  const eventProv = matchProvince(eventLocation);

  if (!userProv || !eventProv) {
    return null;
  }

  if (userProv.code === eventProv.code) {
    return {
      distanceKm: 0,
      isSameProvince: true,
      label: 'Cùng tỉnh/thành',
      sublabel: userProv.name,
    };
  }

  const dist = haversine(userProv.lat, userProv.lng, eventProv.lat, eventProv.lng);
  return {
    distanceKm: dist,
    isSameProvince: false,
    label: `Cách bạn ~${dist.toLocaleString('vi-VN')} km`,
    sublabel: `${eventProv.name}`,
  };
}
