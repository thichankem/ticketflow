/**
 * Location & Distance Service
 * File: backend/src/services/location.service.js
 *
 * Implements Vietnamese Province fast lookup matrix and distance estimation
 * as specified in SPEC.md (Phân hệ 2.2).
 */

// Coordinates for key Vietnamese provinces and municipalities
export const VIETNAM_PROVINCES = [
  { id: 'HN', code: 'HN', name: 'Hà Nội', aliases: ['ha noi', 'hanoi', 'hn'], lat: 21.0285, lng: 105.8542, region: 'Bắc' },
  { id: 'HCM', code: 'HCM', name: 'TP. Hồ Chí Minh', aliases: ['ho chi minh', 'hcm', 'tphcm', 'tp hcm', 'tp.hcm', 'tp. hcm', 'sai gon', 'saigon', 'sg'], lat: 10.8231, lng: 106.6297, region: 'Nam' },
  { id: 'DN', code: 'DN', name: 'Đà Nẵng', aliases: ['da nang', 'danang', 'dn'], lat: 16.0544, lng: 108.2022, region: 'Trung' },
  { id: 'HP', code: 'HP', name: 'Hải Phòng', aliases: ['hai phong', 'haiphong', 'hp'], lat: 20.8449, lng: 106.6881, region: 'Bắc' },
  { id: 'CT', code: 'CT', name: 'Cần Thơ', aliases: ['can tho', 'cantho', 'ct'], lat: 10.0452, lng: 105.7469, region: 'Nam' },
  { id: 'LD', code: 'LD', name: 'Lâm Đồng (Đà Lạt)', aliases: ['da lat', 'dalat', 'lam dong', 'lamdong'], lat: 11.9404, lng: 108.4583, region: 'Tây Nguyên' },
  { id: 'KH', code: 'KH', name: 'Khánh Hòa (Nha Trang)', aliases: ['nha trang', 'nhatrang', 'khanh hoa', 'khanhhoa'], lat: 12.2388, lng: 109.1967, region: 'Trung' },
  { id: 'TTH', code: 'TTH', name: 'Thừa Thiên Huế', aliases: ['hue', 'thua thien hue'], lat: 16.4637, lng: 107.5909, region: 'Trung' },
  { id: 'VT', code: 'VT', name: 'Bà Rịa - Vũng Tàu', aliases: ['vung tau', 'vungtau', 'ba ria vung tau'], lat: 10.3460, lng: 107.0843, region: 'Nam' },
  { id: 'QN', code: 'QN', name: 'Quảng Ninh (Hạ Long)', aliases: ['quang ninh', 'ha long', 'halong'], lat: 20.9505, lng: 107.0734, region: 'Bắc' },
  { id: 'BD', code: 'BD', name: 'Bình Dương', aliases: ['binh duong', 'binhduong'], lat: 11.1600, lng: 106.6500, region: 'Nam' },
  { id: 'DNAI', code: 'DNAI', name: 'Đồng Nai (Biên Hòa)', aliases: ['dong nai', 'dongnai', 'bien hoa'], lat: 10.9574, lng: 106.8427, region: 'Nam' },
  { id: 'BN', code: 'BN', name: 'Bắc Ninh', aliases: ['bac ninh', 'bacninh'], lat: 21.1861, lng: 106.0763, region: 'Bắc' },
  { id: 'TH', code: 'TH', name: 'Thanh Hóa', aliases: ['thanh hoa', 'thanhhoa'], lat: 19.8067, lng: 105.7852, region: 'Bắc Trung Bộ' },
  { id: 'NA', code: 'NA', name: 'Nghệ An (Vinh)', aliases: ['nghe an', 'nghean', 'vinh'], lat: 18.6796, lng: 105.6813, region: 'Bắc Trung Bộ' },
  { id: 'QNA', code: 'QNA', name: 'Quảng Nam (Hội An)', aliases: ['quang nam', 'quangnam', 'hoi an', 'hoian'], lat: 15.8801, lng: 108.3380, region: 'Trung' },
  { id: 'BDI', code: 'BDI', name: 'Bình Định (Quy Nhơn)', aliases: ['binh dinh', 'binhdinh', 'quy nhon', 'quynhon'], lat: 13.7830, lng: 109.2197, region: 'Trung' },
  { id: 'DL', code: 'DL', name: 'Đắk Lắk (Buôn Ma Thuột)', aliases: ['dak lak', 'daklak', 'buon ma thuot'], lat: 12.6667, lng: 108.0383, region: 'Tây Nguyên' },
  { id: 'KG', code: 'KG', name: 'Kiên Giang (Phú Quốc)', aliases: ['kien giang', 'kiengiang', 'phu quoc', 'phuquoc'], lat: 10.2899, lng: 103.9840, region: 'Nam' },
  { id: 'LC', code: 'LC', name: 'Lào Cai (Sa Pa)', aliases: ['lao cai', 'laocai', 'sa pa', 'sapa'], lat: 22.3364, lng: 103.8438, region: 'Tây Bắc' },
  { id: 'TN', code: 'TN', name: 'Tây Ninh', aliases: ['tay ninh', 'tayninh'], lat: 11.3100, lng: 106.0983, region: 'Nam' },
  { id: 'TG', code: 'TG', name: 'Tiền Giang (Mỹ Tho)', aliases: ['tien giang', 'tiengiang', 'my tho'], lat: 10.3592, lng: 106.3639, region: 'Nam' },
  { id: 'BT', code: 'BT', name: 'Bến Tre', aliases: ['ben tre', 'bentre'], lat: 10.2415, lng: 106.3759, region: 'Nam' },
  { id: 'AG', code: 'AG', name: 'An Giang (Long Xuyên)', aliases: ['an giang', 'angiang', 'long xuyen'], lat: 10.5216, lng: 105.1259, region: 'Nam' },
];

function removeVietnameseTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

// Build fast lookup Map
const provinceLookupMap = new Map();

for (const prov of VIETNAM_PROVINCES) {
  provinceLookupMap.set(prov.id.toLowerCase(), prov);
  provinceLookupMap.set(prov.code.toLowerCase(), prov);
  provinceLookupMap.set(removeVietnameseTones(prov.name), prov);
  for (const alias of prov.aliases) {
    provinceLookupMap.set(alias.toLowerCase(), prov);
    provinceLookupMap.set(removeVietnameseTones(alias), prov);
  }
}

/**
 * Haversine formula calculating distance in kilometers between two lat/lng coordinates
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
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

class LocationService {
  /**
   * Returns list of all supported Vietnamese provinces
   */
  getProvinces() {
    return VIETNAM_PROVINCES.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      region: p.region,
      lat: p.lat,
      lng: p.lng,
    }));
  }

  /**
   * Resolve province object from freeform string
   */
  findProvince(query) {
    if (!query || typeof query !== 'string') return null;
    const clean = removeVietnameseTones(query);

    // Exact alias / code lookup
    if (provinceLookupMap.has(clean)) {
      return provinceLookupMap.get(clean);
    }

    // Substring / partial match
    for (const prov of VIETNAM_PROVINCES) {
      const provClean = removeVietnameseTones(prov.name);
      if (clean.includes(provClean) || provClean.includes(clean)) {
        return prov;
      }
      for (const alias of prov.aliases) {
        if (clean.includes(alias) || alias.includes(clean)) {
          return prov;
        }
      }
    }

    return null;
  }

  /**
   * Calculate distance between two provinces or locations
   */
  calculateDistance(fromStr, toStr) {
    const fromProv = this.findProvince(fromStr);
    const toProv = this.findProvince(toStr);

    if (!fromProv || !toProv) {
      return {
        from: fromStr,
        to: toStr,
        distance_km: null,
        formatted: 'Chưa rõ khoảng cách',
        is_same_province: false,
        found_from: Boolean(fromProv),
        found_to: Boolean(toProv),
      };
    }

    if (fromProv.id === toProv.id) {
      return {
        from: fromProv.name,
        to: toProv.name,
        from_code: fromProv.code,
        to_code: toProv.code,
        distance_km: 0,
        formatted: 'Cùng tỉnh/thành với bạn',
        is_same_province: true,
      };
    }

    const distanceKm = calculateHaversineDistance(
      fromProv.lat,
      fromProv.lng,
      toProv.lat,
      toProv.lng
    );

    return {
      from: fromProv.name,
      to: toProv.name,
      from_code: fromProv.code,
      to_code: toProv.code,
      distance_km: distanceKm,
      formatted: `Cách bạn ~${distanceKm} km`,
      is_same_province: false,
    };
  }

  /**
   * Helper to enrich event with user distance info
   */
  enrichEventDistance(event, userProvinceStr) {
    if (!userProvinceStr || !event.location) {
      return {
        ...event,
        distance_info: null,
      };
    }

    const dist = this.calculateDistance(userProvinceStr, event.location);
    return {
      ...event,
      distance_info: dist,
    };
  }
}

export default new LocationService();
