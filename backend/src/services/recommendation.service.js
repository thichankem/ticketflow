/**
 * Hybrid Recommendation Engine
 * File: backend/src/services/recommendation.service.js
 *
 * Implements content-based & behavioral recommendations as specified in SPEC.md (Phân hệ 2.5).
 */

import eventsService from './events.service.js';
import locationService from './location.service.js';
import { query } from '../config/db.js';

class RecommendationService {
  constructor() {
    // Behavioral stores
    this.userViews = new Map(); // userId/sessionId -> Array<{ eventId, timestamp }>
    this.userFavorites = new Map(); // userId -> Set<eventId>
    this.userPurchases = new Map(); // userId -> Set<eventId>
  }

  /**
   * Track event page view
   */
  trackView(userIdOrSession, eventId) {
    if (!userIdOrSession || !eventId) return;
    const key = String(userIdOrSession);
    const numEventId = Number(eventId);

    if (!this.userViews.has(key)) {
      this.userViews.set(key, []);
    }
    const views = this.userViews.get(key);
    views.push({ eventId: numEventId, timestamp: Date.now() });

    // Keep last 50 interactions
    if (views.length > 50) {
      views.shift();
    }
  }

  /**
   * Toggle event favorite / like
   */
  toggleFavorite(userId, eventId) {
    if (!userId || !eventId) return { favorited: false, count: 0 };
    const userKey = String(userId);
    const numEventId = Number(eventId);
    const numUserId = Number(userId);

    if (!this.userFavorites.has(userKey)) {
      this.userFavorites.set(userKey, new Set());
    }
    const favSet = this.userFavorites.get(userKey);
    let favorited = false;

    if (favSet.has(numEventId)) {
      favSet.delete(numEventId);
      favorited = false;
      if (!isNaN(numUserId)) {
        query('DELETE FROM event_favorites WHERE user_id = $1 AND event_id = $2', [numUserId, numEventId]).catch(() => {});
      }
    } else {
      favSet.add(numEventId);
      favorited = true;
      if (!isNaN(numUserId)) {
        query('INSERT INTO event_favorites (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING', [numUserId, numEventId]).catch(() => {});
      }
    }

    // Count total favorites for this event
    let totalCount = 0;
    for (const set of this.userFavorites.values()) {
      if (set.has(numEventId)) totalCount++;
    }

    return { favorited, count: totalCount };
  }

  /**
   * Set event favorite state explicitly (idempotent for subscription / restock alerts)
   */
  setFavorite(userId, eventId, shouldFavorite = true) {
    if (!userId || !eventId) return { favorited: false, count: 0 };
    const userKey = String(userId);
    const numEventId = Number(eventId);
    const numUserId = Number(userId);

    if (!this.userFavorites.has(userKey)) {
      this.userFavorites.set(userKey, new Set());
    }
    const favSet = this.userFavorites.get(userKey);

    if (shouldFavorite) {
      favSet.add(numEventId);
      if (!isNaN(numUserId)) {
        query('INSERT INTO event_favorites (user_id, event_id) VALUES ($1, $2) ON CONFLICT (user_id, event_id) DO NOTHING', [numUserId, numEventId]).catch(() => {});
      }
    } else {
      favSet.delete(numEventId);
      if (!isNaN(numUserId)) {
        query('DELETE FROM event_favorites WHERE user_id = $1 AND event_id = $2', [numUserId, numEventId]).catch(() => {});
      }
    }

    let totalCount = 0;
    for (const set of this.userFavorites.values()) {
      if (set.has(numEventId)) totalCount++;
    }

    return { favorited: Boolean(shouldFavorite), count: totalCount };
  }

  /**
   * Get user favorites
   */
  async getUserFavorites(userId) {
    if (!userId) return [];
    const numUserId = Number(userId);
    if (!isNaN(numUserId)) {
      try {
        const res = await query('SELECT event_id FROM event_favorites WHERE user_id = $1', [numUserId]);
        if (res.rows && res.rows.length > 0) {
          return res.rows.map(r => Number(r.event_id));
        }
      } catch {}
    }
    const set = this.userFavorites.get(String(userId));
    return set ? Array.from(set) : [];
  }

  /**
   * Get all user IDs who favorited an event
   */
  async getUsersWhoFavorited(eventId) {
    const numEventId = Number(eventId);
    if (!isNaN(numEventId)) {
      try {
        const res = await query('SELECT user_id FROM event_favorites WHERE event_id = $1', [numEventId]);
        if (res.rows && res.rows.length > 0) {
          return res.rows.map(r => Number(r.user_id));
        }
      } catch {}
    }
    const users = [];
    for (const [userId, favSet] of this.userFavorites.entries()) {
      if (favSet.has(numEventId)) {
        users.push(userId);
      }
    }
    return users;
  }

  /**
   * Track order purchase for user profile learning
   */
  trackPurchase(userId, eventId) {
    if (!userId || !eventId) return;
    const userKey = String(userId);
    if (!this.userPurchases.has(userKey)) {
      this.userPurchases.set(userKey, new Set());
    }
    this.userPurchases.get(userKey).add(Number(eventId));
  }

  /**
   * Hybrid recommendation scoring algorithm
   */
  async getRecommendations({
    userId = null,
    currentEventId = null,
    category = null,
    tags = [],
    userProvince = null,
    limit = 6,
  } = {}) {
    const allEvents = await eventsService.listEvents();
    const excludeId = currentEventId ? Number(currentEventId) : null;
    const candidates = allEvents.filter(
      (e) => e.status === 'LIVE' && e.id !== excludeId
    );

    const userKey = userId ? String(userId) : null;
    const viewedEvents = userKey && this.userViews.has(userKey)
      ? new Set(this.userViews.get(userKey).map((v) => v.eventId))
      : new Set();
    const purchasedEvents = userKey && this.userPurchases.has(userKey)
      ? this.userPurchases.get(userKey)
      : new Set();
    const favoriteEvents = userKey && this.userFavorites.has(userKey)
      ? this.userFavorites.get(userKey)
      : new Set();

    // Determine user preferred categories based on purchase & favorite history
    const preferredCategories = new Map();
    for (const ev of allEvents) {
      if (purchasedEvents.has(ev.id) || favoriteEvents.has(ev.id)) {
        const cat = (ev.category || 'GENERAL').toUpperCase();
        preferredCategories.set(cat, (preferredCategories.get(cat) || 0) + 1);
      }
    }

    const scoredEvents = candidates.map((event) => {
      let score = 0;
      const reasons = [];

      const evCategory = (event.category || '').toUpperCase();
      const targetCategory = (category || '').toUpperCase();

      // 1. Content-based: Category Match (35%)
      if (targetCategory && evCategory === targetCategory) {
        score += 35;
        reasons.push(`Cùng chủ đề ${event.category}`);
      }

      // 2. Content-based: Tags Similarity (25%)
      const evTags = Array.isArray(event.tags)
        ? event.tags.map((t) => String(t).toLowerCase())
        : (event.description || '').toLowerCase().split(/\s+/);
      const queryTags = Array.isArray(tags) ? tags.map((t) => String(t).toLowerCase()) : [];

      let tagMatches = 0;
      for (const t of queryTags) {
        if (evTags.some((et) => et.includes(t) || t.includes(et))) {
          tagMatches++;
        }
      }
      if (tagMatches > 0) {
        const tagScore = Math.min(25, tagMatches * 10);
        score += tagScore;
        reasons.push('Nhiều sở thích tương đồng');
      }

      // 3. Behavioral: Historical Preferences (25%)
      if (preferredCategories.has(evCategory)) {
        score += 20;
        reasons.push(`Phù hợp với các sự kiện ${event.category} bạn quan tâm`);
      }
      if (favoriteEvents.has(event.id)) {
        score += 15;
        reasons.push('Bạn đã yêu thích');
      } else if (viewedEvents.has(event.id)) {
        score += 10;
        reasons.push('Bạn đã xem gần đây');
      }

      // 4. Geographic Proximity Boost (15%)
      let distanceInfo = null;
      if (userProvince && event.location) {
        distanceInfo = locationService.calculateDistance(userProvince, event.location);
        if (distanceInfo.is_same_province) {
          score += 15;
          reasons.push('Cùng khu vực với bạn');
        } else if (distanceInfo.distance_km && distanceInfo.distance_km < 100) {
          score += 10;
          reasons.push('Gần bạn (< 100 km)');
        }
      }

      // Default baseline score for popular/live events
      score += 5;
      if (reasons.length === 0) {
        reasons.push('Sự kiện nổi bật được yêu thích');
      }

      return {
        ...event,
        recommendation_score: score,
        recommendation_reasons: reasons,
        distance_info: distanceInfo,
      };
    });

    // Sort by recommendation score descending
    scoredEvents.sort((a, b) => b.recommendation_score - a.recommendation_score);

    return scoredEvents.slice(0, limit);
  }
}

export default new RecommendationService();
