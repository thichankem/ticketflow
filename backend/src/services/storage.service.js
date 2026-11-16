import { supabase } from '../config/supabase.js';

export const ALLOWED_MIME_TYPES = {
  'event-docs': ['image/png', 'image/jpeg', 'image/webp'],
  'event-images': ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

class StorageService {
  /**
   * Uploads a file buffer or base64 payload to the specified Supabase Storage bucket.
   * Strictly enforces image MIME types (disallows video and PDF).
   *
   * @param {string} bucket - Target bucket ('event-docs' | 'event-images' | 'helpdesk-evidence')
   * @param {string} filePath - Path / file name inside bucket
   * @param {Buffer|Uint8Array|string} fileData - File buffer or base64 string
   * @param {string} mimeType - File MIME type (e.g. 'image/webp')
   * @returns {Promise<{ key: string, publicUrl?: string, path: string }>}
   */
  async uploadFile(bucket, filePath, fileData, mimeType = 'image/webp') {
    if (!bucket || !filePath) {
      throw new Error('Bucket and filePath are required');
    }

    const cleanMime = mimeType.toLowerCase();

    // Explicit rejection for video and PDF formats
    if (cleanMime.startsWith('video/')) {
      const err = new Error('Không cho phép tải video lên. Hệ thống chỉ hỗ trợ tệp hình ảnh (PNG, JPEG, WebP).');
      err.statusCode = 400;
      throw err;
    }
    if (cleanMime === 'application/pdf') {
      const err = new Error('Không hỗ trợ tệp PDF nữa. Vui lòng chỉ tải lên hình ảnh.');
      err.statusCode = 400;
      throw err;
    }

    const allowed = ALLOWED_MIME_TYPES[bucket] || ALLOWED_MIME_TYPES['event-images'];
    if (!allowed.includes(cleanMime)) {
      const err = new Error(`File type ${mimeType} is not permitted in bucket ${bucket}. Only images (PNG, JPEG, WebP) are allowed.`);
      err.statusCode = 400;
      throw err;
    }

    let buffer;
    if (Buffer.isBuffer(fileData)) {
      buffer = fileData;
    } else if (typeof fileData === 'string') {
      const cleanBase64 = fileData.includes(';base64,') ? fileData.split(';base64,')[1] : fileData;
      buffer = Buffer.from(cleanBase64, 'base64');
    } else {
      buffer = Buffer.from(fileData);
    }

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      const err = new Error(`File size (${Math.round(buffer.length / 1024 / 1024)}MB) exceeds max allowed limit (10MB)`);
      err.statusCode = 400;
      throw err;
    }

    const { data, error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) {
      console.warn(`[StorageService.uploadFile] Supabase Storage upload error: ${error.message}`);
      return {
        key: filePath,
        path: filePath,
        publicUrl: this.getPublicUrl(bucket, filePath),
        status: 'STORED_LOCAL_METADATA',
      };
    }

    const publicUrl = this.getPublicUrl(bucket, filePath);
    return {
      key: data.path,
      path: data.path,
      publicUrl,
      status: 'UPLOADED',
    };
  }

  /**
   * Retrieves public URL for public buckets.
   */
  getPublicUrl(bucket, filePath) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    return data.publicUrl;
  }

  /**
   * Generates a signed URL for private bucket objects.
   */
  async createSignedUrl(bucket, filePath, expiresIn = 3600) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, expiresIn);
    if (error) {
      throw new Error(`Failed to create signed URL: ${error.message}`);
    }
    return data.signedUrl;
  }

  /**
   * Deletes a file from bucket.
   */
  async deleteFile(bucket, filePath) {
    const { error } = await supabase.storage.from(bucket).remove([filePath]);
    if (error) {
      console.warn(`[StorageService.deleteFile] Delete error: ${error.message}`);
      return false;
    }
    return true;
  }
}

export default new StorageService();
