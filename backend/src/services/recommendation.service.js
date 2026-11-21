/**
 * Hybrid Recommendation Engine
 * File: backend/src/services/recommendation.service.js
 *
 * Implements content-based & behavioral recommendations as specified in SPEC.md (Module 2.5).
 */

import eventsService from './events.service.js';
import locationService from './location.service.js';
import { query } from '../config/db.js';

class RecommendationService {
  constructor() {
    // Behavioral stores
    this.userViews = new Map(); // userId/sessionId -> Array<{ eventId, timestamp }>
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

    // Determine user preferred categories based on purchase and browsing history
    const preferredCategories = new Map();
    for (const ev of allEvents) {
      if (purchasedEvents.has(ev.id) || viewedEvents.has(ev.id)) {
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
        reasons.push(`Similar topic ${event.category}`);
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
        reasons.push('Matches your common interests');
      }

      // 3. Behavioral: Historical Preferences (25%)
      if (preferredCategories.has(evCategory)) {
        score += 20;
        reasons.push(`Matches ${event.category} events you follow`);
      }
      if (viewedEvents.has(event.id)) {
        score += 15;
        reasons.push('Recently viewed');
      }

      // 4. Geographic Proximity Boost (15%)
      let distanceInfo = null;
      if (userProvince && event.location) {
        distanceInfo = locationService.calculateDistance(userProvince, event.location);
        if (distanceInfo.is_same_province) {
          score += 15;
          reasons.push('In your region');
        } else if (distanceInfo.distance_km && distanceInfo.distance_km < 100) {
          score += 10;
          reasons.push('Near you (< 100 km)');
        }
      }

      // Default baseline score for popular/live events
      score += 5;
      if (reasons.length === 0) {
        reasons.push('Popular trending event');
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
