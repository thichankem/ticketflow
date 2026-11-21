import { query } from '../config/db.js';
import { demoEvents } from '../data/demo-catalog.js';
import storageService from './storage.service.js';

// In-memory fallback. Id 1 stays the original summit so list order matches the E2E suite.
export const memoryEvents = new Map(demoEvents.map((event) => [event.id, { ...event }]));
let nextEventId = Math.max(...demoEvents.map((event) => event.id));

export function resolveImageUrl(pathOrUrl) {
  if (!pathOrUrl || typeof pathOrUrl !== 'string') return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('/')) {
    return pathOrUrl;
  }
  return storageService.getPublicUrl('event-images', pathOrUrl);
}

const eventCover = (slug, category) => {
  const bySlug = {
    'tech-conf-2026': '/images/events/summit.svg',
    'tech-conference-2026': '/images/events/summit.svg',
    'saigon-jazz-night': '/images/events/jazz.svg',
    'dalat-marathon': '/images/events/marathon.svg',
    'dalat-highland-marathon': '/images/events/marathon.svg',
    'indie-film-weekend': '/images/events/film.svg',
    'riverside-meetup': '/images/events/meetup.svg',
    'riverside-community-meetup': '/images/events/meetup.svg',
    'midnight-edm': '/images/events/edm.svg',
    'midnight-edm-flash-sale': '/images/events/edm.svg',
    'startup-pitch-night': '/images/events/pitch.svg',
    'ux-studio-workshop': '/images/events/ux.svg',
  };
  const byCategory = {
    TECHNOLOGY: '/images/events/summit.svg',
    TECH: '/images/events/summit.svg',
    MUSIC: '/images/events/jazz.svg',
    SPORTS: '/images/events/marathon.svg',
    FILM: '/images/events/film.svg',
    COMMUNITY: '/images/events/meetup.svg',
    BUSINESS: '/images/events/pitch.svg',
    DESIGN: '/images/events/ux.svg',
  };
  return bySlug[slug] || byCategory[category] || '/images/events/summit.svg';
};

const defaultRefundPolicy = {
  allow_refund: true,
  max_days_after_order: 7,
  min_days_before_event: 3,
  refund_percentage: 100,
};

function parseLocationDetails(details) {
  if (!details) return {};
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
}

function formatEvent(r) {
  const locDetails = parseLocationDetails(r.location_details);
  const rawCover = r.cover || r.image_url || locDetails.cover || locDetails.image_url;
  const coverImg = resolveImageUrl(rawCover) || eventCover(r.slug || r.short_id, r.category);
  const rawBanner = r.banner || r.banner_url || locDetails.banner || locDetails.banner_url;
  const bannerImg = resolveImageUrl(rawBanner) || coverImg;
  return {
    ...r,
    id: Number(r.id),
    account_id: Number(r.account_id),
    category: r.category || 'TECH',
    location: r.location || 'TP. Hồ Chí Minh',
    cover: coverImg,
    image_url: coverImg,
    banner: bannerImg,
    banner_url: bannerImg,
    tags: r.tags || locDetails.tags || ['Event', r.category || 'Tech'],
    blog_blocks: r.blog_blocks || locDetails.blog_blocks || (r.description ? [
      { type: 'paragraph', text: r.description }
    ] : []),
    blocks: r.blocks || r.blog_blocks || locDetails.blog_blocks || (r.description ? [
      { type: 'paragraph', text: r.description }
    ] : []),
    pdf_attachments: [],
    refund_policy: r.refund_policy || locDetails.refund_policy || defaultRefundPolicy,
    seat_map_url: r.seat_map_url || locDetails.seat_map_url || '/images/seat-map-theater.svg',
    ticket_tiers: (r.ticket_tiers || []).map(t => ({
      ...t,
      id: Number(t.id),
      event_id: Number(t.event_id),
      price: Number(t.price),
      total_quantity: Number(t.total_quantity || t.initial_quantity),
      initial_quantity: Number(t.initial_quantity),
      remaining_quantity: Number(t.remaining_quantity),
      min_per_order: Number(t.min_per_order),
      max_per_order: Number(t.max_per_order),
    })),
  };
}

class EventsService {
  async listEvents() {
    try {
      // Real database fetch eliminating N+1 query patterns using PostgreSQL JSON aggregation
      const sql = `
        SELECT 
          e.*,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', t.id,
                'event_id', t.event_id,
                'name', t.title,
                'title', t.title,
                'type', t.type,
                'tier_type', t.type,
                'price', t.price,
                'total_quantity', t.initial_quantity,
                'initial_quantity', t.initial_quantity,
                'remaining_quantity', t.remaining_quantity,
                'min_per_order', t.min_per_order,
                'max_per_order', t.max_per_order,
                'is_hidden', t.is_hidden
              )
            ) FILTER (WHERE t.id IS NOT NULL AND t.is_hidden = false),
            '[]'::json
          ) AS ticket_tiers
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        WHERE e.deleted_at IS NULL
        GROUP BY e.id
        ORDER BY e.id ASC
      `;
      const res = await query(sql);
      return (res.rows || []).map(r => formatEvent(r));
    } catch (dbErr) {
      console.warn('[EventsService.listEvents] Database query error, using fallback:', dbErr.message);
    }

    // Fallback in-memory. Lowest id first so events[0] remains Global Tech Summit.
    const { default: ticketsService } = await import('./tickets.service.js');
    const list = [];
    for (const ev of memoryEvents.values()) {
      if (ev.deleted_at) continue;
      const tiers = await ticketsService.listByEventId(ev.id, false);
      list.push(formatEvent({ ...ev, ticket_tiers: tiers }));
    }
    list.sort((a, b) => Number(a.id) - Number(b.id));
    return list;
  }

  async getEventById(id, user = null) {
    const numId = Number(id);
    const includeHidden = Boolean(user && (user.role === 'ADMIN' || user.role === 'ORGANIZER'));
    try {
      // Single-query fetch eliminating N+1
      const sql = `
        SELECT 
          e.*,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', t.id,
                'event_id', t.event_id,
                'name', t.title,
                'title', t.title,
                'type', t.type,
                'tier_type', t.type,
                'price', t.price,
                'total_quantity', t.initial_quantity,
                'initial_quantity', t.initial_quantity,
                'remaining_quantity', t.remaining_quantity,
                'min_per_order', t.min_per_order,
                'max_per_order', t.max_per_order,
                'is_hidden', t.is_hidden
              )
            ) FILTER (WHERE t.id IS NOT NULL AND (t.is_hidden = false OR $2 = true)),
            '[]'::json
          ) AS ticket_tiers
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        WHERE e.id = $1 AND e.deleted_at IS NULL
        GROUP BY e.id
      `;
      const res = await query(sql, [numId, includeHidden]);
      if (res.rowCount > 0) {
        return formatEvent(res.rows[0]);
      }
      if (memoryEvents.has(numId)) {
        const ev = memoryEvents.get(numId);
        if (!ev || ev.deleted_at) return null;
        const { default: ticketsService } = await import('./tickets.service.js');
        const tiers = await ticketsService.listByEventId(ev.id, includeHidden);
        return formatEvent({ ...ev, ticket_tiers: tiers });
      }
      return null;
    } catch (dbErr) {
      console.warn('[EventsService.getEventById] Database query error, using fallback:', dbErr.message);
    }

    const ev = memoryEvents.get(numId);
    if (!ev || ev.deleted_at) return null;
    const { default: ticketsService } = await import('./tickets.service.js');
    const tiers = await ticketsService.listByEventId(ev.id, includeHidden);
    return formatEvent({ ...ev, ticket_tiers: tiers });
  }

  async createEvent(user, eventData) {
    const {
      title,
      description,
      starts_at,
      start_date,
      ends_at,
      end_date,
      status = 'LIVE',
      category = 'TECH',
      location = 'TP. Hồ Chí Minh',
      location_name,
      province_code = 'HCM',
      tags = [],
      blog_blocks = [],
      blocks = [],
      cover,
      image_url,
      banner,
      banner_url,
      pdf_attachments = [],
      refund_policy = defaultRefundPolicy,
      seat_map_url = '/images/seat-map-theater.svg',
      commission_rate = 5.00,
    } = eventData;

    if (!title) {
      const err = new Error('Event title is required');
      err.statusCode = 400;
      throw err;
    }

    const accountId = user.account_id || 1;
    const finalStartDate = start_date || starts_at || new Date().toISOString();
    const finalEndDate = end_date || ends_at || new Date(Date.now() + 86400000).toISOString();
    const finalLocationName = location_name || location || 'TP. Hồ Chí Minh';
    const finalProvinceCode = province_code || 'HCM';
    const finalTags = tags && tags.length > 0 ? tags : ['Event', category];
    const finalRefundPolicy = refund_policy || defaultRefundPolicy;
    const finalCover = cover || image_url || null;
    const finalBanner = banner || banner_url || finalCover || null;

    const locationDetails = JSON.stringify({
      venue: finalLocationName,
      location_name: finalLocationName,
      province_code: finalProvinceCode,
      tags: finalTags,
      blog_blocks: (blog_blocks && blog_blocks.length > 0)
        ? blog_blocks
        : ((blocks && blocks.length > 0)
          ? blocks
          : [{ type: 'paragraph', text: description || '' }]),
      cover: finalCover,
      banner: finalBanner,
      refund_policy: finalRefundPolicy,
      seat_map_url: seat_map_url || '/images/seat-map-theater.svg',
    });

    try {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `event-${Date.now()}`;
      const shortId = `ev_${Date.now()}`;
      const sql = `
        INSERT INTO events (
          account_id, title, slug, description, status, start_date, end_date,
          short_id, category, location, location_name, province_code, tags,
          refund_policy, commission_rate, location_details, cover, banner, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
        RETURNING *, start_date AS starts_at, end_date AS ends_at
      `;
      const res = await query(sql, [
        accountId,
        title,
        slug,
        description || '',
        status,
        finalStartDate,
        finalEndDate,
        shortId,
        category,
        finalLocationName,
        finalLocationName,
        finalProvinceCode,
        finalTags,
        JSON.stringify(finalRefundPolicy),
        commission_rate,
        locationDetails,
        finalCover,
        finalBanner,
      ]);
      const created = res.rows[0];

      // Link any draft media assets in event_media_assets
      try {
        await query(
          `UPDATE event_media_assets
           SET event_id = $1
           WHERE event_id IS NULL AND account_id = $2
             AND (public_url = $3 OR public_url = $4 OR storage_path = $3 OR storage_path = $4)`,
          [created.id, accountId, finalCover, finalBanner]
        );
      } catch (linkErr) {
        console.warn('[EventsService.createEvent] Error linking media assets:', linkErr.message);
      }

      // Seed escrow account for the newly created event
      try {
        await query(`
          INSERT INTO escrow_accounts (event_id, gross_revenue, refunded_amount, current_balance, commission_held, payout_status, updated_at)
          VALUES ($1, 0, 0, 0, 0, 'HOLDING', NOW())
          ON CONFLICT (event_id) DO NOTHING
        `, [created.id]);
      } catch {}

      // Auto-create ticket tiers if passed in eventData
      const rawTiers = eventData.ticket_tiers || eventData.tiers;
      if (Array.isArray(rawTiers) && rawTiers.length > 0) {
        const { default: ticketsService } = await import('./tickets.service.js');
        for (const t of rawTiers) {
          try {
            await ticketsService.createTier(created.id, t, user);
          } catch (tierErr) {
            console.warn('[EventsService.createEvent] Error auto-creating tier:', tierErr.message);
          }
        }
      }

      return formatEvent(created);
    } catch (dbErr) {
      console.warn('[EventsService.createEvent] Database insert error, using fallback:', dbErr.message);
      // Fallback in-memory
      const id = ++nextEventId;
      const rawTiers = eventData.ticket_tiers || eventData.tiers;
      const fallbackTiers = [];
      if (Array.isArray(rawTiers) && rawTiers.length > 0) {
        const { default: ticketsService } = await import('./tickets.service.js');
        for (const t of rawTiers) {
          try {
            const ct = await ticketsService.createTier(id, t, user);
            if (ct) fallbackTiers.push(ct);
          } catch (tierErr) {
            console.warn('[EventsService.createEvent] Error auto-creating tier fallback:', tierErr.message);
          }
        }
      }

      const newEvent = formatEvent({
        id,
        account_id: accountId,
        title,
        description: description || '',
        status,
        category,
        start_date: finalStartDate,
        end_date: finalEndDate,
        starts_at: finalStartDate,
        ends_at: finalEndDate,
        location: finalLocationName,
        location_name: finalLocationName,
        province_code: finalProvinceCode,
        tags: finalTags,
        cover: finalCover,
        banner: finalBanner,
        refund_policy: finalRefundPolicy,
        commission_rate,
        location_details: JSON.parse(locationDetails),
        ticket_tiers: fallbackTiers,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      memoryEvents.set(id, newEvent);
      return newEvent;
    }
  }

  async updateEvent(user, id, updates) {
    const numId = Number(id);
    const existing = await this.getEventById(numId);
    if (!existing) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    if (user.role !== 'ADMIN' && Number(existing.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const currentDetails = parseLocationDetails(existing.location_details);
    const updatedCover = updates.cover !== undefined ? updates.cover : (updates.image_url !== undefined ? updates.image_url : existing.cover);
    const updatedBanner = updates.banner !== undefined ? updates.banner : (updates.banner_url !== undefined ? updates.banner_url : (existing.banner || updatedCover));

    const mergedDetails = JSON.stringify({
      ...currentDetails,
      cover: updatedCover,
      banner: updatedBanner,
      tags: updates.tags || existing.tags || currentDetails.tags,
      blog_blocks: updates.blog_blocks || updates.blocks || existing.blog_blocks || currentDetails.blog_blocks,
      refund_policy: updates.refund_policy || existing.refund_policy || currentDetails.refund_policy,
      seat_map_url: updates.seat_map_url || existing.seat_map_url || currentDetails.seat_map_url,
    });

    try {
      const sql = `
        UPDATE events
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            status = COALESCE($3, status),
            location_details = $4,
            cover = COALESCE($5, cover),
            banner = COALESCE($6, banner),
            updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `;
      const res = await query(sql, [
        updates.title,
        updates.description,
        updates.status,
        mergedDetails,
        updatedCover,
        updatedBanner,
        numId,
      ]);

      // If cover or banner was replaced, retire old storage objects safely
      if (existing.cover && existing.cover !== updatedCover) {
        const oldPath = storageService.extractStoragePath(existing.cover);
        if (oldPath && oldPath.startsWith('events/')) {
          storageService.deleteFile('event-images', oldPath).catch(() => {});
          query('DELETE FROM event_media_assets WHERE storage_path = $1', [oldPath]).catch(() => {});
        }
      }
      if (existing.banner && existing.banner !== updatedBanner) {
        const oldPath = storageService.extractStoragePath(existing.banner);
        if (oldPath && oldPath.startsWith('events/')) {
          storageService.deleteFile('event-images', oldPath).catch(() => {});
          query('DELETE FROM event_media_assets WHERE storage_path = $1', [oldPath]).catch(() => {});
        }
      }

      // Link any new media assets
      try {
        await query(
          `UPDATE event_media_assets
           SET event_id = $1
           WHERE event_id IS NULL AND (public_url = $2 OR public_url = $3 OR storage_path = $2 OR storage_path = $3)`,
          [numId, updatedCover, updatedBanner]
        );
      } catch {}

      return formatEvent(res.rows[0]);
    } catch {
      // Fallback
      if (updates.title) existing.title = updates.title;
      if (updates.description) existing.description = updates.description;
      if (updates.status) existing.status = updates.status;
      if (updates.tags) existing.tags = updates.tags;
      if (updates.blog_blocks || updates.blocks) {
        const finalBlks = updates.blocks || updates.blog_blocks;
        existing.blog_blocks = finalBlks;
        existing.blocks = finalBlks;
      }
      if (updates.cover !== undefined) existing.cover = updates.cover;
      if (updates.banner !== undefined) existing.banner = updates.banner;
      if (updates.refund_policy) existing.refund_policy = updates.refund_policy;
      if (updates.seat_map_url) existing.seat_map_url = updates.seat_map_url;
      existing.location_details = mergedDetails;
      memoryEvents.set(numId, existing);
      return formatEvent(existing);
    }
  }

  async addAttachment(eventId, attachment, user = null) {
    const numId = Number(eventId);
    const existing = await this.getEventById(numId, user);
    if (!existing) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user && user.role !== 'ADMIN' && Number(existing.account_id) !== Number(user.account_id) && Number(existing.organizer_id) !== Number(user.id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const newAtt = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      filename: attachment.filename || attachment.name || 'document.pdf',
      url: attachment.url || `/api/events/${numId}/attachments/${Date.now()}`,
      size: attachment.size || 0,
      uploaded_at: new Date().toISOString(),
    };

    const currentAttachments = Array.isArray(existing.pdf_attachments) ? existing.pdf_attachments : [];
    currentAttachments.push(newAtt);
    existing.pdf_attachments = currentAttachments;

    const currentDetails = parseLocationDetails(existing.location_details);
    currentDetails.pdf_attachments = currentAttachments;

    try {
      await query(
        'UPDATE events SET location_details = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(currentDetails), numId]
      );
    } catch {}

    const memEv = memoryEvents.get(numId);
    if (memEv) {
      memEv.pdf_attachments = currentAttachments;
    }

    return newAtt;
  }

  async getAttachments(eventId, user = null) {
    const numId = Number(eventId);
    const existing = await this.getEventById(numId, user);
    if (!existing) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    return Array.isArray(existing.pdf_attachments) ? existing.pdf_attachments : [];
  }

  async updateAttachment(eventId, attachmentId, data, user = null) {
    const numId = Number(eventId);
    const existing = await this.getEventById(numId, user);
    if (!existing) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user && user.role !== 'ADMIN' && Number(existing.account_id) !== Number(user.account_id) && Number(existing.organizer_id) !== Number(user.id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const currentAttachments = Array.isArray(existing.pdf_attachments) ? existing.pdf_attachments : [];
    const att = currentAttachments.find((a) => a.id === attachmentId || a.filename === attachmentId);
    if (!att) {
      const err = new Error('Attachment not found');
      err.statusCode = 404;
      throw err;
    }

    if (data.filename) att.filename = data.filename.trim();
    if (data.name) att.filename = data.name.trim();
    if (data.description !== undefined) att.description = data.description;
    att.updated_at = new Date().toISOString();

    existing.pdf_attachments = currentAttachments;
    const currentDetails = parseLocationDetails(existing.location_details);
    currentDetails.pdf_attachments = currentAttachments;

    try {
      await query(
        'UPDATE events SET location_details = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(currentDetails), numId]
      );
    } catch {}

    const memEv = memoryEvents.get(numId);
    if (memEv) {
      memEv.pdf_attachments = currentAttachments;
    }

    return att;
  }

  async deleteAttachment(eventId, attachmentId, user = null) {
    const numId = Number(eventId);
    const existing = await this.getEventById(numId, user);
    if (!existing) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    if (user && user.role !== 'ADMIN' && Number(existing.account_id) !== Number(user.account_id) && Number(existing.organizer_id) !== Number(user.id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const currentAttachments = Array.isArray(existing.pdf_attachments) ? existing.pdf_attachments : [];
    const filtered = currentAttachments.filter((a) => a.id !== attachmentId && a.filename !== attachmentId);

    existing.pdf_attachments = filtered;
    const currentDetails = parseLocationDetails(existing.location_details);
    currentDetails.pdf_attachments = filtered;

    try {
      await query(
        'UPDATE events SET location_details = $1, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(currentDetails), numId]
      );
    } catch {}

    const memEv = memoryEvents.get(numId);
    if (memEv) {
      memEv.pdf_attachments = filtered;
    }

    return { success: true };
  }

  async deleteEvent(user, id) {
    const numId = Number(id);
    let existing = await this.getEventById(numId, user).catch(() => null);
    if (!existing) {
      existing = memoryEvents.get(numId);
    }
    if (!existing || existing.deleted_at) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }

    if (user.role !== 'ADMIN' && Number(existing.account_id) !== Number(user.account_id)) {
      const err = new Error('Forbidden: Event does not belong to user account');
      err.statusCode = 403;
      throw err;
    }

    const { default: ordersService } = await import('./orders.service.js');
    let notificationsService = null;
    try {
      const mod = await import('./notifications.service.js');
      notificationsService = mod.default;
    } catch {}

    let refundedOrdersCount = 0;
    let refundedAmount = 0;
    const notifiedUserIds = new Set();

    // Authoritative mass refund & settlement processing via refundService (TF-P0-A, TF-V4-P1-04, TF-V4-F10)
    const { default: refundService } = await import('./refund.service.js');
    let massRefundResult = null;
    let refundError = null;
    try {
      massRefundResult = await refundService.massRefundEvent(numId, user);
      if (massRefundResult) {
        refundedOrdersCount = Number(massRefundResult.succeeded_count || 0);
        refundedAmount = Number(massRefundResult.total_refunded || 0);
      }
    } catch (refErr) {
      console.warn('[deleteEvent] massRefundEvent error:', refErr.message);
      refundError = refErr;
    }

    const hasFailedRefunds = Boolean(refundError || (massRefundResult && massRefundResult.failed_count > 0));

    // If mass refund has failures or pending obligations, preserve cancellation state and halt deletion (TF-V4-P1-04)
    if (hasFailedRefunds) {
      await query(
        "UPDATE events SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1",
        [numId]
      );
      if (existing) existing.status = 'CANCELLED';
      const memEv = memoryEvents.get(numId);
      if (memEv) memEv.status = 'CANCELLED';

      return {
        success: false,
        status: 'PARTIALLY_REFUNDED',
        event_status: 'CANCELLED',
        message: 'Event transitioned to CANCELLED status, but some orders could not be automatically refunded. Refund obligations remain pending.',
        mass_refund: massRefundResult || { error: refundError?.message },
      };
    }

    try {
      // Check if any orders ever existed for this event
      const anyOrdersRes = await query(`SELECT COUNT(*) AS cnt FROM orders WHERE event_id = $1`, [numId]);
      const anyOrdersCount = Number(anyOrdersRes?.rows?.[0]?.cnt || 0);

      if (anyOrdersCount > 0) {
        // Soft delete event to preserve historical audit trail & order visibility for buyers
        await query(`
          UPDATE events
          SET deleted_at = NOW(), status = 'CANCELLED', updated_at = NOW()
          WHERE id = $1
        `, [numId]);
      } else {
        // Complete hard delete for events without orders: clean up associated media objects from cloud storage
        try {
          const { rows: mediaRows } = await query(
            'SELECT storage_path FROM event_media_assets WHERE event_id = $1',
            [numId]
          );
          for (const m of mediaRows) {
            if (m.storage_path) {
              storageService.deleteFile('event-images', m.storage_path).catch(() => {});
            }
          }
        } catch {}
        await query('DELETE FROM event_settings WHERE event_id = $1', [numId]).catch(() => {});
        await query('DELETE FROM event_favorites WHERE event_id = $1', [numId]).catch(() => {});
        await query('DELETE FROM promo_codes WHERE event_id = $1', [numId]).catch(() => {});
        await query('DELETE FROM escrow_accounts WHERE event_id = $1', [numId]).catch(() => {});
        await query('DELETE FROM ticket_tiers WHERE event_id = $1', [numId]).catch(() => {});
        await query('DELETE FROM events WHERE id = $1', [numId]);
      }
    } catch (dbErr) {
      console.error('[EventsService.deleteEvent] Database deletion failed:', dbErr.message);
      throw dbErr;
    }

    // Only remove from active in-memory events map if database deletion succeeded (V6-07)
    memoryEvents.delete(numId);

    // Send notifications to buyers
    if (notificationsService) {
      for (const uId of notifiedUserIds) {
        notificationsService.createNotification({
          userId: uId,
          eventId: numId,
          type: 'EVENT_CANCELLED',
          title: `Event "${existing.title}" has been cancelled`,
          message: `Event "${existing.title}" was deleted by the organizer. Your order has been automatically refunded 100%.`,
        }).catch(() => {});
      }
    }

    return {
      success: true,
      message: refundedOrdersCount > 0
        ? `Event deleted successfully with 100% automatic refund processed for ${refundedOrdersCount} orders (${refundedAmount.toLocaleString('en-US')} VND).`
        : 'Event deleted successfully.',
      refunded_orders_count: refundedOrdersCount,
      refunded_amount: refundedAmount,
    };
  }

  async getAllEventsWithMetrics() {
    try {
      const sql = `
        SELECT 
          e.id,
          e.title,
          e.slug,
          e.status,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          e.created_at,
          COALESCE(SUM(t.initial_quantity), 0)::int AS total_tickets,
          COALESCE(
            (SELECT SUM(oi.quantity) FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.event_id = e.id AND o.status = 'COMPLETED'),
            0
          )::int AS sold_tickets,
          COALESCE(
            (SELECT SUM(total_gross) FROM orders o WHERE o.event_id = e.id AND o.status = 'COMPLETED'),
            0
          )::numeric AS revenue
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        WHERE e.deleted_at IS NULL AND UPPER(e.status) != 'DRAFT'
        GROUP BY e.id
        ORDER BY e.id ASC
      `;
      const res = await query(sql);
      return (res.rows || []).map(r => ({
        id: Number(r.id),
        title: r.title,
        slug: r.slug,
        status: r.status,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        total_tickets: Number(r.total_tickets),
        sold_tickets: Number(r.sold_tickets),
        revenue: Number(r.revenue),
        created_at: r.created_at,
      }));
    } catch (dbErr) {
      console.warn('[EventsService.getAllEventsWithMetrics] DB error, using fallback:', dbErr.message);
    }

    const { default: ticketsService } = await import('./tickets.service.js');
    const { default: ordersService } = await import('./orders.service.js');
    const allOrders = ordersService.getMemoryOrders ? ordersService.getMemoryOrders() : [];

    const list = [];
    for (const ev of memoryEvents.values()) {
      if ((ev.status || '').toUpperCase() === 'DRAFT') continue;
      const tiers = await ticketsService.listByEventId(ev.id, true);
      const total_tickets = tiers.reduce((sum, t) => sum + (Number(t.total_quantity || t.initial_quantity) || 0), 0);
      const sold_tickets = tiers.reduce((sum, t) => sum + ((Number(t.total_quantity || t.initial_quantity) || 0) - (Number(t.remaining_quantity) || 0)), 0);
      const evOrders = allOrders.filter(o => o.event_id === ev.id && o.status === 'COMPLETED');
      const revenue = evOrders.reduce((sum, o) => sum + Number(o.total || o.total_gross || 0), 0);

      list.push({
        id: ev.id,
        title: ev.title,
        slug: ev.slug || `event-${ev.id}`,
        status: ev.status,
        starts_at: ev.starts_at,
        ends_at: ev.ends_at,
        total_tickets,
        sold_tickets,
        revenue,
        created_at: ev.created_at || new Date().toISOString(),
      });
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  async updateEventStatus(id, status) {
    const numId = Number(id);
    const validStatuses = ['LIVE', 'DRAFT', 'CANCELLED', 'ARCHIVED'];
    const normalizedStatus = (status || '').toUpperCase().trim();
    if (!validStatuses.includes(normalizedStatus)) {
      const err = new Error(`Invalid status: ${status}. Must be one of ${validStatuses.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    try {
      const sql = `
        UPDATE events
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      const res = await query(sql, [normalizedStatus, numId]);
      if (res.rowCount > 0) {
        return {
          ...res.rows[0],
          id: Number(res.rows[0].id),
          account_id: Number(res.rows[0].account_id),
        };
      }
    } catch (err) {
      if (err.statusCode) throw err;
    }

    const ev = memoryEvents.get(numId);
    if (!ev) {
      const err = new Error('Event not found');
      err.statusCode = 404;
      throw err;
    }
    ev.status = normalizedStatus;
    memoryEvents.set(numId, ev);
    return ev;
  }

  async adminDeleteEvent(id) {
    return this.deleteEvent({ role: 'ADMIN', account_id: 1 }, id);
  }

  async getOrganizerDashboard(user) {
    const accountId = Number(user.account_id || 1);
    const isAdmin = user.role === 'ADMIN';

    try {
      const sql = `
        SELECT 
          e.*,
          e.start_date AS starts_at,
          e.end_date AS ends_at,
          COALESCE(SUM(t.initial_quantity - t.remaining_quantity), 0)::int AS tickets_sold,
          COALESCE(
            (SELECT SUM(total_gross) FROM orders o WHERE o.event_id = e.id AND o.status = 'COMPLETED'),
            0
          )::numeric AS gross_revenue,
          COALESCE(
            (SELECT COUNT(*) FROM attendees a WHERE a.event_id = e.id AND a.status != 'CANCELLED'),
            0
          )::int AS attendee_count
        FROM events e
        LEFT JOIN ticket_tiers t ON e.id = t.event_id
        WHERE ($1 = TRUE OR e.account_id = $2) AND e.deleted_at IS NULL
        GROUP BY e.id
        ORDER BY e.id ASC
      `;
      const res = await query(sql, [isAdmin, accountId]);
      return (res.rows || []).map(r => ({
        ...r,
        id: Number(r.id),
        account_id: Number(r.account_id),
        cover: r.cover || eventCover(r.slug || r.short_id, r.category),
        banner: r.banner || r.cover || eventCover(r.slug || r.short_id, r.category),
        tickets_sold: Number(r.tickets_sold),
        gross_revenue: Number(r.gross_revenue),
        attendee_count: Number(r.attendee_count),
      }));
    } catch (dbErr) {
      console.warn('[EventsService.getOrganizerDashboard] DB error, using fallback:', dbErr.message);
    }

    const { default: ticketsService } = await import('./tickets.service.js');
    const { default: ordersService } = await import('./orders.service.js');
    const allOrders = ordersService.getMemoryOrders ? ordersService.getMemoryOrders() : [];
    const allAttendees = ordersService.getMemoryAttendees ? ordersService.getMemoryAttendees() : [];

    const list = [];
    for (const ev of memoryEvents.values()) {
      if (ev.deleted_at) continue;
      if (!isAdmin && Number(ev.account_id) !== accountId) {
        continue;
      }
      const tiers = await ticketsService.listByEventId(ev.id, true);
      const tickets_sold = tiers.reduce((sum, t) => sum + ((Number(t.total_quantity || t.initial_quantity) || 0) - (Number(t.remaining_quantity) || 0)), 0);
      const evOrders = allOrders.filter(o => o.event_id === ev.id && o.status === 'COMPLETED');
      const gross_revenue = evOrders.reduce((sum, o) => sum + Number(o.total || o.total_gross || 0), 0);
      const evAttendees = allAttendees.filter(a => a.event_id === ev.id && a.status !== 'CANCELLED');
      const attendee_count = evAttendees.length;

      list.push({
        ...ev,
        cover: ev.cover || eventCover(ev.slug || ev.short_id, ev.category),
        banner: ev.banner || ev.cover || eventCover(ev.slug || ev.short_id, ev.category),
        tickets_sold,
        gross_revenue,
        attendee_count,
      });
    }
    list.sort((a, b) => a.id - b.id);
    return list;
  }

  getMemoryEvents() {
    return Array.from(memoryEvents.values());
  }
}

export default new EventsService();
