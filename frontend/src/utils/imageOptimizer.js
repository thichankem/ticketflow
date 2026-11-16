/**
 * TicketFlow Client-Side Image Optimizer & Validator
 *
 * Enforces strict constraints:
 * - Prohibits video uploads explicitly.
 * - Prohibits PDF uploads.
 * - Enforces maximum input file size (10MB).
 * - Automatically resizes dimensions (e.g. 1920x1080 for banners, 1200x1200 for posters/content).
 * - Automatically compresses format into optimized WebP (with JPEG fallback).
 */

export const MAX_RAW_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

export function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Validates file type and size before any processing.
 * Throws explicit, descriptive errors in Vietnamese if forbidden types are selected.
 */
export function validateImageFile(file) {
  if (!file) {
    throw new Error('Vui lòng chọn một tệp hình ảnh.');
  }

  const name = file.name || '';
  const type = (file.type || '').toLowerCase();

  // 1. Prohibit video uploads
  const isVideo = type.startsWith('video/') || /\.(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp|ts)$/i.test(name);
  if (isVideo) {
    throw new Error('⛔ Không cho phép tải video lên! Hệ thống chỉ hỗ trợ tệp hình ảnh (PNG, JPG, WebP).');
  }

  // 2. Prohibit PDF uploads
  const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
  if (isPdf) {
    throw new Error('⛔ Không hỗ trợ tệp PDF nữa! Vui lòng chỉ tải lên tệp hình ảnh (PNG, JPG, WebP).');
  }

  // 3. Prohibit other non-image files
  const isImage = type.startsWith('image/') || /\.(png|jpe?g|webp|svg|gif)$/i.test(name);
  if (!isImage) {
    throw new Error('⛔ Định dạng tệp không hợp lệ! Vui lòng chỉ tải lên tệp hình ảnh (PNG, JPG, WebP).');
  }

  // 4. Maximum size constraint (10MB)
  if (file.size > MAX_RAW_FILE_SIZE_BYTES) {
    throw new Error(`⛔ Dung lượng ảnh (${formatFileSize(file.size)}) vượt quá giới hạn tối đa cho phép (${formatFileSize(MAX_RAW_FILE_SIZE_BYTES)}).`);
  }

  return true;
}

/**
 * Compresses and resizes an image file using an off-screen HTML5 Canvas.
 *
 * @param {File|Blob} file
 * @param {Object} options
 * @param {number} [options.maxWidth=1920] - Maximum width constraint
 * @param {number} [options.maxHeight=1080] - Maximum height constraint
 * @param {number} [options.quality=0.82] - Compression quality (0 to 1)
 * @param {string} [options.targetFormat='image/webp'] - Target image format
 * @returns {Promise<{
 *   dataUrl: string,
 *   originalSize: number,
 *   compressedSize: number,
 *   width: number,
 *   height: number,
 *   originalWidth: number,
 *   originalHeight: number,
 *   format: string,
 *   originalName: string,
 *   savingsPercent: number
 * }>}
 */
export function compressAndResizeImage(file, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      validateImageFile(file);
    } catch (err) {
      return reject(err);
    }

    const {
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 0.82,
      targetFormat = 'image/webp',
    } = options;

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp hình ảnh đã chọn.'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp hình ảnh bị lỗi hoặc không thể giải mã.'));
      img.onload = () => {
        try {
          const originalWidth = img.naturalWidth || img.width;
          const originalHeight = img.naturalHeight || img.height;

          // Compute aspect-ratio preserving dimensions constrained to maxWidth & maxHeight
          let width = originalWidth;
          let height = originalHeight;

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }

          // Offscreen Canvas processing
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            return reject(new Error('Trình duyệt không hỗ trợ Canvas 2D để tối ưu hoá ảnh.'));
          }

          // Use high-quality bicubic smoothing
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Optional white background for translucent PNGs if exporting to JPEG
          if (targetFormat === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);

          // Attempt to export as WebP
          let dataUrl = canvas.toDataURL(targetFormat, quality);

          // If browser fails WebP export, fall back to JPEG
          if (!dataUrl.startsWith(`data:${targetFormat}`)) {
            dataUrl = canvas.toDataURL('image/jpeg', quality);
          }

          // Calculate resulting byte size from base64 string
          const base64Str = dataUrl.split(',')[1] || '';
          const compressedSize = Math.round((base64Str.length * 3) / 4);
          const savingsPercent = Math.max(0, Math.round((1 - compressedSize / file.size) * 100));

          const cleanFormat = dataUrl.startsWith('data:image/webp')
            ? 'WebP'
            : dataUrl.startsWith('data:image/jpeg')
            ? 'JPEG'
            : 'PNG';

          resolve({
            dataUrl,
            originalSize: file.size,
            compressedSize,
            width,
            height,
            originalWidth,
            originalHeight,
            format: cleanFormat,
            originalName: file.name,
            savingsPercent,
          });
        } catch (canvasErr) {
          reject(new Error(`Lỗi trong quá trình nén ảnh: ${canvasErr.message}`));
        }
      };

      img.src = e.target.result;
    };

    reader.readAsDataURL(file);
  });
}
