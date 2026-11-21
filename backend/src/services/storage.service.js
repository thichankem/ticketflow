import crypto from 'node:crypto';
import sharp from 'sharp';
import { supabase, SUPABASE_STORAGE_BUCKET } from '../config/supabase.js';
import { query } from '../config/db.js';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export const ALLOWED_MIME_TYPES = {
  'event-docs': ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
  'event-images': ALLOWED_IMAGE_MIME_TYPES,
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_IMAGE_PIXELS = 50 * 1000 * 1000; // 50 Megapixels (Decompression bomb protection)

export const IMAGE_DIMENSION_LIMITS = {
  cover: { maxWidth: 1600, maxHeight: 1600 },
  banner: { maxWidth: 1920, maxHeight: 1080 },
  blog: { maxWidth: 1400, maxHeight: 1400 },
  default: { maxWidth: 1600, maxHeight: 1600 },
};

class StorageService {
  /**
   * Identifies file MIME type from actual magic bytes signature.
   * Prevents extension spoofing and polyglot files.
   *
   * @param {Buffer} buffer
   * @returns {string|null}
   */
  detectMagicBytes(buffer) {
    if (!buffer || buffer.length < 4) return null;

    // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
    if (buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-') {
      return 'application/pdf';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'image/png';
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }

    // WebP: RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
  }

  /**
   * Validates and optimizes raw image buffer using sharp:
   * - Strips EXIF metadata for privacy
   * - Auto-rotates orientation based on EXIF
   * - Resizes within target dimensions preserving aspect ratio without distortion or enlargement
   * - Converts into high-efficiency WebP format
   *
   * @param {Buffer} buffer
   * @param {string} mediaType - 'cover' | 'banner' | 'blog'
   * @returns {Promise<{ buffer: Buffer, width: number, height: number, size: number, format: string, mimeType: string, originalSize: number }>}
   */
  async optimizeImage(buffer, mediaType = 'cover') {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
      const err = new Error('Invalid image file or empty file payload.');
      err.statusCode = 400;
      throw err;
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      const err = new Error(
        `File size (${(buffer.length / 1024 / 1024).toFixed(1)}MB) exceeds maximum limit allowed (10MB).`
      );
      err.statusCode = 400;
      throw err;
    }

    const detected = this.detectMagicBytes(buffer);
    if (!detected || !ALLOWED_IMAGE_MIME_TYPES.includes(detected)) {
      const err = new Error(
        'Unsupported file format. System only accepts PNG, JPEG, or WebP images.'
      );
      err.statusCode = 400;
      throw err;
    }

    const limits = IMAGE_DIMENSION_LIMITS[mediaType] || IMAGE_DIMENSION_LIMITS.default;

    let imageInstance;
    let metadata;
    try {
      imageInstance = sharp(buffer, {
        failOn: 'error',
        limitInputPixels: MAX_IMAGE_PIXELS,
      });
      metadata = await imageInstance.metadata();
    } catch (sharpErr) {
      const err = new Error(`Cannot decode image file or file is corrupted: ${sharpErr.message}`);
      err.statusCode = 400;
      throw err;
    }

    const allowedFormats = ['jpeg', 'png', 'webp'];
    if (!metadata.format || !allowedFormats.includes(metadata.format)) {
      const err = new Error('Only PNG, JPEG, or WebP image formats are accepted.');
      err.statusCode = 400;
      throw err;
    }

    // Auto-rotate according to EXIF, strip metadata, resize preserving aspect ratio, convert to WebP
    const optimizedBuffer = await imageInstance
      .rotate()
      .resize({
        width: limits.maxWidth,
        height: limits.maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: 82,
        effort: 4,
      })
      .toBuffer();

    const finalMeta = await sharp(optimizedBuffer).metadata();

    return {
      buffer: optimizedBuffer,
      width: finalMeta.width || 0,
      height: finalMeta.height || 0,
      size: optimizedBuffer.length,
      format: 'webp',
      mimeType: 'image/webp',
      originalSize: buffer.length,
    };
  }

  /**
   * Generates a collision-free, path-traversal-proof Supabase Storage key.
   * Path format: events/{eventIdOrDraft}/{subfolder}/{uuid}.webp
   *
   * @param {string|number} eventIdOrDraft
   * @param {string} mediaType - 'cover' | 'banner' | 'blog'
   * @returns {string}
   */
  generateStoragePath(eventIdOrDraft, mediaType = 'cover') {
    const safeSegment = String(eventIdOrDraft).replace(/[^a-zA-Z0-9_-]/g, '');
    const subfolder = mediaType === 'banner' ? 'banners' : mediaType === 'blog' ? 'blog' : 'covers';
    const uuid = crypto.randomUUID();
    return `events/${safeSegment}/${subfolder}/${uuid}.webp`;
  }

  /**
   * Extracts clean relative storage path from a full Supabase URL or relative string.
   *
   * @param {string} urlOrPath
   * @returns {string}
   */
  extractStoragePath(urlOrPath) {
    if (!urlOrPath || typeof urlOrPath !== 'string') return '';
    const trimmed = urlOrPath.trim();

    // If it's a full public URL: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
    const marker = '/storage/v1/object/public/';
    const markerIdx = trimmed.indexOf(marker);
    if (markerIdx !== -1) {
      const after = trimmed.substring(markerIdx + marker.length);
      const slashIdx = after.indexOf('/');
      return slashIdx !== -1 ? after.substring(slashIdx + 1) : after;
    }

    // If it starts with bucket name e.g. event-images/events/...
    if (trimmed.startsWith('event-images/')) {
      return trimmed.substring('event-images/'.length);
    }

    // Strip leading slashes
    return trimmed.replace(/^\/+/, '');
  }

  /**
   * Uploads an event marketing image (Cover, Banner, Blog media) to Supabase Storage:
   * 1. Verifies caller authorization and event ownership
   * 2. Validates format via magic bytes
   * 3. Performs sharp optimization into high-compression WebP
   * 4. Uploads to Supabase Storage `event-images` bucket
   * 5. Saves metadata into `event_media_assets`
   * 6. Cleans up replaced previous storage object if applicable
   *
   * @param {Object} params
   * @param {Buffer|string} params.fileData - Buffer or base64 string
   * @param {string} [params.fileName] - Original filename
   * @param {string} [params.mimeType] - Declared mime type
   * @param {number|string} [params.eventId] - Event ID if editing existing event
   * @param {string} [params.mediaType='cover'] - 'cover' | 'banner' | 'blog'
   * @param {Object} params.user - Authenticated user context
   * @returns {Promise<{ success: boolean, url: string, path: string, key: string, metadata: Object }>}
   */
  async uploadEventImage({ fileData, fileName, mimeType, eventId, mediaType = 'cover', user }) {
    if (!user) {
      const err = new Error('Authentication required to upload image.');
      err.statusCode = 401;
      throw err;
    }

    const role = (user.role || '').toUpperCase();
    if (role !== 'ORGANIZER' && role !== 'ADMIN') {
      const err = new Error('Only Organizers or Administrators can upload event images.');
      err.statusCode = 403;
      throw err;
    }

    const accountId = Number(user.account_id || user.accountId || user.id || 1);

    // Convert payload to Buffer
    let rawBuffer;
    if (Buffer.isBuffer(fileData)) {
      rawBuffer = fileData;
    } else if (typeof fileData === 'string') {
      const cleanBase64 = fileData.includes(';base64,') ? fileData.split(';base64,')[1] : fileData;
      rawBuffer = Buffer.from(cleanBase64, 'base64');
    } else {
      const err = new Error('Invalid image upload payload.');
      err.statusCode = 400;
      throw err;
    }

    // Explicit video and PDF rejections with descriptive messages
    const lowerName = (fileName || '').toLowerCase();
    const lowerMime = (mimeType || '').toLowerCase();
    if (
      lowerMime.startsWith('video/') ||
      /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/i.test(lowerName)
    ) {
      const err = new Error(
        'Video upload not allowed. System only supports image files (PNG, JPEG, WebP).'
      );
      err.statusCode = 400;
      throw err;
    }
    if (lowerMime === 'application/pdf' || /\.pdf$/i.test(lowerName)) {
      const err = new Error(
        'Do not upload PDF files as event images. Please upload documents in event attachments.'
      );
      err.statusCode = 400;
      throw err;
    }

    // If eventId provided, verify ownership
    let existingEvent = null;
    let numEventId = null;
    if (eventId) {
      numEventId = parseInt(eventId, 10);
      if (Number.isFinite(numEventId)) {
        const evRes = await query('SELECT id, account_id, cover, banner FROM events WHERE id = $1', [
          numEventId,
        ]);
        if (evRes.rows.length === 0) {
          const err = new Error('Event does not exist.');
          err.statusCode = 404;
          throw err;
        }
        existingEvent = evRes.rows[0];
        if (role !== 'ADMIN' && Number(existingEvent.account_id) !== accountId) {
          const err = new Error('You do not have permission to edit images for this event.');
          err.statusCode = 403;
          throw err;
        }
      }
    }

    // Optimize image
    const normalizedType = ['cover', 'banner', 'blog'].includes(mediaType) ? mediaType : 'cover';
    const optimized = await this.optimizeImage(rawBuffer, normalizedType);

    // Generate unique storage path
    const targetScope = numEventId || `draft-${accountId}-${Date.now()}`;
    const storagePath = this.generateStoragePath(targetScope, normalizedType);

    // Upload to Supabase Storage
    const bucket = SUPABASE_STORAGE_BUCKET || 'event-images';
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, optimized.buffer, {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
        upsert: false,
      });

    if (uploadError) {
      const err = new Error(`Failed to upload image to Supabase Storage: ${uploadError.message}`);
      err.statusCode = 502;
      throw err;
    }

    const publicUrl = this.getPublicUrl(bucket, storagePath);

    // Persist metadata to PostgreSQL
    let mediaAssetId = null;
    try {
      const metaRes = await query(
        `INSERT INTO event_media_assets (
          account_id, event_id, bucket, storage_path, public_url,
          media_type, original_filename, mime_type, size_bytes, width, height
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          accountId,
          numEventId,
          bucket,
          storagePath,
          publicUrl,
          normalizedType,
          fileName || 'image.webp',
          optimized.mimeType,
          optimized.size,
          optimized.width,
          optimized.height,
        ]
      );
      if (metaRes.rows.length > 0) {
        mediaAssetId = metaRes.rows[0].id;
      }
    } catch (dbErr) {
      // Compensating action: remove uploaded object if DB metadata insert fails
      console.warn(
        `[StorageService.uploadEventImage] DB metadata insert failed. Cleaning up orphan ${storagePath}: ${dbErr.message}`
      );
      await this.deleteFile(bucket, storagePath);
      const err = new Error('Could not save image metadata to database.');
      err.statusCode = 500;
      throw err;
    }

    // If editing existing event and replacing cover or banner:
    // Update event record and safely delete the old storage object
    if (existingEvent && (normalizedType === 'cover' || normalizedType === 'banner')) {
      const oldImageField = normalizedType === 'cover' ? existingEvent.cover : existingEvent.banner;
      const oldStoragePath = this.extractStoragePath(oldImageField);

      try {
        const updateSql =
          normalizedType === 'cover'
            ? 'UPDATE events SET cover = $1, updated_at = NOW() WHERE id = $2'
            : 'UPDATE events SET banner = $1, updated_at = NOW() WHERE id = $2';
        await query(updateSql, [publicUrl, numEventId]);

        // Safely retire previous storage object if it belongs to event-images
        if (
          oldStoragePath &&
          oldStoragePath.startsWith('events/') &&
          oldStoragePath !== storagePath
        ) {
          await this.deleteFile(bucket, oldStoragePath).catch(() => {});
          await query('DELETE FROM event_media_assets WHERE storage_path = $1', [oldStoragePath]).catch(() => {});
        }
      } catch (updateErr) {
        // Compensating cleanup on DB failure: remove uploaded storage object (TF-P1-D)
        await this.deleteFile(bucket, storagePath).catch(() => {});
        const err = new Error(`Database error updating event image: ${updateErr.message}`);
        err.statusCode = 500;
        throw err;
      }
    }

    const savingsPercent = Math.max(
      0,
      Math.round((1 - optimized.size / optimized.originalSize) * 100)
    );

    return {
      success: true,
      url: publicUrl,
      path: storagePath,
      key: storagePath,
      assetId: mediaAssetId,
      metadata: {
        width: optimized.width,
        height: optimized.height,
        size: optimized.size,
        originalSize: optimized.originalSize,
        savingsPercent,
        mimeType: 'image/webp',
        format: 'webp',
      },
    };
  }

  /**
   * Deletes an event image safely:
   * - Validates user permissions (ORGANIZER of the event or ADMIN)
   * - Prevents path traversal
   * - Deletes object from Supabase Storage
   * - Updates event record (clears cover/banner)
   * - Deletes metadata record
   *
   * @param {Object} params
   * @param {number|string} params.eventId
   * @param {string} [params.mediaType='cover'] - 'cover' | 'banner' | 'blog'
   * @param {string} [params.storagePath]
   * @param {Object} params.user
   */
  async deleteEventImage({ eventId, mediaType = 'cover', storagePath, user }) {
    if (!user) {
      const err = new Error('Authentication required to delete image.');
      err.statusCode = 401;
      throw err;
    }

    const role = (user.role || '').toUpperCase();
    if (role !== 'ORGANIZER' && role !== 'ADMIN') {
      const err = new Error('Only Organizers or Administrators can delete images.');
      err.statusCode = 403;
      throw err;
    }

    const numEventId = parseInt(eventId, 10);
    if (!Number.isFinite(numEventId)) {
      const err = new Error('Invalid event ID.');
      err.statusCode = 400;
      throw err;
    }

    const evRes = await query('SELECT id, account_id, cover, banner FROM events WHERE id = $1', [
      numEventId,
    ]);
    if (evRes.rows.length === 0) {
      const err = new Error('Event does not exist.');
      err.statusCode = 404;
      throw err;
    }
    const event = evRes.rows[0];

    const accountId = Number(user.account_id || user.accountId || user.id || 1);
    if (role !== 'ADMIN' && Number(event.account_id) !== accountId) {
      const err = new Error('You do not have permission to delete images for this event.');
      err.statusCode = 403;
      throw err;
    }

    const bucket = SUPABASE_STORAGE_BUCKET || 'event-images';
    let targetPath = this.extractStoragePath(storagePath);

    if (!targetPath) {
      if (mediaType === 'cover' && event.cover) {
        targetPath = this.extractStoragePath(event.cover);
      } else if (mediaType === 'banner' && event.banner) {
        targetPath = this.extractStoragePath(event.banner);
      }
    }

    // Path traversal check
    if (targetPath.includes('..') || targetPath.includes('//')) {
      const err = new Error('Invalid storage object path.');
      err.statusCode = 400;
      throw err;
    }

    // Tenant and Registered Asset Scoping Check (TF-P0-06 / TF-P1-D / TF-V3-P1-05 / TF-V4-P1-07)
    const normalizedCoverPath = event.cover ? this.extractStoragePath(event.cover) : null;
    const normalizedBannerPath = event.banner ? this.extractStoragePath(event.banner) : null;
    const isEventCover = Boolean(normalizedCoverPath && targetPath === normalizedCoverPath);
    const isEventBanner = Boolean(normalizedBannerPath && targetPath === normalizedBannerPath);
    let isRegisteredAsset = isEventCover || isEventBanner;
    let registeredMediaType = isEventCover ? 'cover' : isEventBanner ? 'banner' : null;

    if (!isRegisteredAsset) {
      try {
        const assetRes = await query(
          'SELECT id, media_type FROM event_media_assets WHERE event_id = $1 AND storage_path = $2 LIMIT 1',
          [numEventId, targetPath]
        );
        if (assetRes.rowCount > 0) {
          isRegisteredAsset = true;
          registeredMediaType = assetRes.rows[0].media_type;
        }
      } catch {}
    }

    // Both Admin and Organizer MUST only delete assets registered to the specified event
    if (!isRegisteredAsset) {
      const err = new Error('Forbidden: Cannot delete storage objects that do not belong to this event.');
      err.statusCode = 403;
      throw err;
    }

    // Database state update first: only clear cover/banner if this specific asset was actually the cover/banner
    if (isEventCover || registeredMediaType === 'cover') {
      await query('UPDATE events SET cover = NULL, updated_at = NOW() WHERE id = $1', [numEventId]);
    } else if (isEventBanner || registeredMediaType === 'banner') {
      await query('UPDATE events SET banner = NULL, updated_at = NOW() WHERE id = $1', [numEventId]);
    }
    await query('DELETE FROM event_media_assets WHERE event_id = $1 AND storage_path = $2', [numEventId, targetPath]).catch(() => {});

    // Delete from Supabase Storage
    if (targetPath && targetPath.startsWith('events/')) {
      await this.deleteFile(bucket, targetPath);
    }

    return {
      success: true,
      message: 'Image deleted securely from cloud storage.',
    };
  }

  /**
   * Retrieves public URL for public buckets.
   */
  getPublicUrl(bucket, filePath) {
    if (!filePath) return '';
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      return filePath;
    }
    const cleanPath = this.extractStoragePath(filePath);
    const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath);
    return data.publicUrl;
  }

  /**
   * Generates a signed URL for private bucket objects.
   */
  async createSignedUrl(bucket, filePath, expiresIn = 3600) {
    const cleanPath = this.extractStoragePath(filePath);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(cleanPath, expiresIn);
    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }
    return data.signedUrl;
  }

  /**
   * Deletes a file from bucket.
   */
  async deleteFile(bucket, filePath) {
    if (!filePath) return false;
    const cleanPath = this.extractStoragePath(filePath);
    const { error } = await supabase.storage.from(bucket).remove([cleanPath]);
    if (error) {
      console.warn(`[StorageService.deleteFile] Delete error: ${error.message}`);
      return false;
    }
    return true;
  }

  /**
   * Generic file upload (used for PDF brochures and attachments).
   * Supports both (bucket, filePath, fileData, mimeType) and (bucket, fileBuffer, fileName, mimeType, user).
   */
  async uploadFile(bucket, p2, p3, p4 = 'application/pdf') {
    if (!bucket) {
      throw new Error('Bucket is required');
    }

    let filePath;
    let buffer;
    let mimeType = (p4 || 'application/pdf').toLowerCase();

    if (Buffer.isBuffer(p2)) {
      buffer = p2;
      const safeName = (p3 || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
      filePath = `docs/${Date.now()}-${safeName}`;
    } else {
      filePath = p2;
      if (Buffer.isBuffer(p3)) {
        buffer = p3;
      } else if (typeof p3 === 'string') {
        const cleanBase64 = p3.includes(';base64,') ? p3.split(';base64,')[1] : p3;
        buffer = Buffer.from(cleanBase64, 'base64');
      } else {
        buffer = Buffer.from(p3 || '');
      }
    }

    if (mimeType.startsWith('video/')) {
      const err = new Error(
        'Video upload not allowed. System only supports PDF documents and images (PNG, JPEG, WebP).'
      );
      err.statusCode = 400;
      throw err;
    }

    const allowed = ALLOWED_MIME_TYPES[bucket] || ALLOWED_MIME_TYPES['event-images'];
    if (!allowed.includes(mimeType)) {
      const err = new Error(
        `File type ${mimeType} is not permitted in bucket ${bucket}. Allowed types: ${allowed.join(', ')}.`
      );
      err.statusCode = 400;
      throw err;
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      const err = new Error(
        `File size (${Math.round(buffer.length / 1024 / 1024)}MB) exceeds max allowed limit (10MB)`
      );
      err.statusCode = 400;
      throw err;
    }

    // Magic bytes verification for PDF
    if (mimeType === 'application/pdf') {
      const isPdfMagic = buffer.length >= 5 && buffer.slice(0, 5).toString('ascii') === '%PDF-';
      if (!isPdfMagic) {
        const err = new Error('File content is not valid PDF format');
        err.statusCode = 400;
        throw err;
      }
    }

    const { data, error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) {
      const err = new Error(`Supabase Storage upload error: ${error.message}`);
      err.statusCode = 502;
      throw err;
    }

    const publicUrl = this.getPublicUrl(bucket, filePath);
    return {
      key: data.path,
      path: data.path,
      url: publicUrl,
      publicUrl,
      status: 'UPLOADED',
    };
  }
}

export default new StorageService();
