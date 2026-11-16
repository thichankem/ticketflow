import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { formatFileSize, validateImageFile } from '../utils/imageOptimizer';

export const ImageUploader = ({
  id = 'image-uploader',
  label = 'Tải ảnh lên',
  hint = '',
  value = '',
  onChange = () => {},
  eventId = null,
  mediaType = null,
  aspect = 'banner', // 'banner' (16:9) | 'cover' (4:3) | 'square' (1:1)
  maxWidth = 1920,
  maxHeight = 1080,
  quality = 0.82,
  required = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [compressionStats, setCompressionStats] = useState(null);
  const [localPreview, setLocalPreview] = useState(null);
  const fileInputRef = useRef(null);

  // Clean up object URL when component unmounts
  useEffect(() => {
    return () => {
      if (localPreview && localPreview.startsWith('blob:')) {
        URL.revokeObjectURL(localPreview);
      }
    };
  }, [localPreview]);

  const effectiveMediaType = mediaType || (aspect === 'banner' ? 'banner' : 'cover');

  const handleProcessFile = async (file) => {
    if (!file) return;
    setErrorMessage(null);
    setProcessing(true);

    let tempPreviewUrl = null;
    try {
      // 1. Client-side validation: format (PNG, JPEG, WebP) and size (10MB)
      validateImageFile(file);

      // 2. Generate zero-overhead instant preview via ObjectURL
      tempPreviewUrl = URL.createObjectURL(file);
      setLocalPreview(tempPreviewUrl);

      // 3. Authenticated backend upload to Supabase Storage with server-side WebP optimization
      const res = await api.events.uploadImage({
        file,
        eventId,
        mediaType: effectiveMediaType,
        fileName: file.name,
      });

      if (!res?.url) {
        throw new Error(res?.error || 'Tải ảnh lên hệ thống thất bại.');
      }

      // 4. Update compression & upload stats
      const meta = res.metadata || {};
      setCompressionStats({
        originalSize: meta.originalSize || file.size,
        compressedSize: meta.size || file.size,
        format: meta.format ? meta.format.toUpperCase() : 'WEBP',
        width: meta.width || maxWidth,
        height: meta.height || maxHeight,
        savingsPercent: meta.savingsPercent !== undefined ? meta.savingsPercent : 0,
      });

      // 5. Notify parent with the permanent Supabase Storage public URL
      onChange(res.url, res.metadata);
    } catch (err) {
      setErrorMessage(err.message || 'Không thể xử lý và tải lên hình ảnh');
      // If upload failed, clear temporary preview
      if (tempPreviewUrl) {
        URL.revokeObjectURL(tempPreviewUrl);
        setLocalPreview(null);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleClear = async () => {
    const previousValue = value;
    onChange('', null);
    setCompressionStats(null);
    setErrorMessage(null);
    if (localPreview && localPreview.startsWith('blob:')) {
      URL.revokeObjectURL(localPreview);
    }
    setLocalPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // If deleting from an existing event and had a stored image, notify backend
    if (eventId && previousValue && previousValue.includes('supabase.co')) {
      try {
        await api.events.deleteImage({
          eventId,
          mediaType: effectiveMediaType,
          storagePath: previousValue,
        });
      } catch (err) {
        console.warn('[ImageUploader.handleClear] Error deleting remote image:', err.message);
      }
    }
  };

  const triggerSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Preview source: either active value or local blob while processing
  const displaySource = localPreview || value;

  return (
    <div className="image-uploader-wrapper">
      <div className="flex justify-between items-center mb-025">
        <label htmlFor={id} className="font-semibold text-sm m-0">
          {label} {required && <span className="text-danger">*</span>}
        </label>
        {displaySource && (
          <button
            type="button"
            className="btn btn-ghost btn-xs text-danger"
            onClick={handleClear}
            title="Xóa hình ảnh này"
            disabled={processing}
          >
            ✕ Xóa ảnh
          </button>
        )}
      </div>

      {hint && <p className="muted text-xs mb-035">{hint}</p>}

      {/* Hidden native file input - strictly accepting PNG, JPG, WEBP */}
      <input
        ref={fileInputRef}
        id={id}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        style={{ display: 'none' }}
        onChange={handleInputChange}
        disabled={processing}
      />

      {/* Error alert if forbidden format, size, or upload error occurred */}
      {errorMessage && (
        <div className="alert alert-error text-xs mb-05 flex items-center justify-between" role="alert">
          <span>{errorMessage}</span>
          <button
            type="button"
            className="btn btn-ghost btn-xs p-0 text-danger"
            onClick={() => setErrorMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Image Preview or Dropzone */}
      {displaySource ? (
        <div className={`uploader-preview-card aspect-${aspect}`}>
          <img
            src={displaySource}
            alt={label}
            className="uploader-preview-img"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = '/images/events/summit.svg';
            }}
          />

          <div className="uploader-preview-overlay">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={triggerSelect}
              disabled={processing}
            >
              🔄 Thay đổi ảnh
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleClear}
              disabled={processing}
            >
              🗑️ Xóa
            </button>
          </div>

          {processing && (
            <div className="uploader-overlay-loading">
              <div className="spinner" />
              <span className="text-xs font-semibold text-white mt-1">Đang tải lên Supabase Storage...</span>
            </div>
          )}

          {compressionStats && (
            <div className="uploader-stats-badge" title="Thông số ảnh đã tự động tối ưu qua Supabase Storage">
              ⚡ Đã tối ưu: {formatFileSize(compressionStats.originalSize)} ➔{' '}
              {formatFileSize(compressionStats.compressedSize)} ({compressionStats.format},{' '}
              {compressionStats.width}×{compressionStats.height}){' '}
              <span className="badge-saving">-{compressionStats.savingsPercent}%</span>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`uploader-dropzone ${isDragging ? 'is-dragging' : ''} ${processing ? 'is-processing' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={triggerSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              triggerSelect();
            }
          }}
        >
          {processing ? (
            <div className="uploader-processing-state">
              <div className="spinner" />
              <p className="font-semibold text-sm mt-05">Đang xử lý & tải lên Supabase Storage...</p>
              <p className="muted text-xs">Tự động nén WebP và lưu trữ đám mây</p>
            </div>
          ) : (
            <div className="uploader-empty-state">
              <div className="uploader-icon">🖼️</div>
              <p className="uploader-prompt">
                <strong>Nhấp để chọn ảnh</strong> hoặc kéo thả tệp ảnh vào đây
              </p>
              <p className="uploader-subtext">
                Hỗ trợ <strong>PNG, JPG, WebP</strong> • Tối đa <strong>10MB</strong> • Lưu trữ đám mây Supabase Storage
              </p>
              <div className="uploader-restriction-pill">
                ⛔ Không hỗ trợ tệp Video & tệp PDF
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
