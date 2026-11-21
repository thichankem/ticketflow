import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';
import { formatFileSize, validateImageFile } from '../utils/imageOptimizer';
import { Icon } from './ui/Icon';
import { VectorSpinner } from './ui/VectorAnimation';

export const ImageUploader = ({
  id = 'image-uploader',
  label = 'Tải ảnh lên',
  hint = '',
  value,
  initialUrl = '',
  onChange,
  onUploadComplete,
  eventId = null,
  mediaType = null,
  targetType = null,
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

  // Support both canonical and backward-compatible props
  const effectiveValue = value !== undefined && value !== null ? value : (initialUrl || '');
  const effectiveMediaType = mediaType || targetType || (aspect === 'banner' ? 'banner' : 'cover');
  const effectiveAspect = aspect !== 'banner' ? aspect : (effectiveMediaType === 'cover' ? 'cover' : aspect);

  const triggerChange = (url, metadata = null) => {
    if (typeof onChange === 'function') {
      onChange(url, metadata);
    }
    if (typeof onUploadComplete === 'function') {
      onUploadComplete(url, metadata);
    }
  };

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
      triggerChange(res.url, res.metadata);
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
    const previousValue = effectiveValue;
    triggerChange('', null);
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
  const displaySource = localPreview || effectiveValue;

  return (
    <div className="image-uploader-wrapper">
      <div className="flex justify-between items-center mb-025">
        <label htmlFor={id} className="font-semibold text-sm m-0">
          {label} {required && <span className="text-danger">*</span>}
        </label>
        {displaySource && (
          <button
            type="button"
            className="btn btn-ghost btn-xs text-danger flex items-center gap-1"
            onClick={handleClear}
            title="Xóa hình ảnh này"
            disabled={processing}
          >
            <Icon name="trash" size="xs" ariaHidden />
            <span>Xóa ảnh</span>
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
          <span className="flex items-center gap-1">
            <Icon name="alert-circle" size="xs" ariaHidden />
            {errorMessage}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs p-0 text-danger"
            onClick={() => setErrorMessage(null)}
            aria-label="Đóng thông báo"
          >
            <Icon name="x" size="xs" ariaHidden />
          </button>
        </div>
      )}

      {/* Image Preview or Dropzone */}
      {displaySource ? (
        <div className={`uploader-preview-card aspect-${effectiveAspect}`}>
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
              className="btn btn-secondary btn-sm flex items-center gap-1"
              onClick={triggerSelect}
              disabled={processing}
            >
              <Icon name="refresh" size="sm" ariaHidden />
              <span>Thay đổi ảnh</span>
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm flex items-center gap-1"
              onClick={handleClear}
              disabled={processing}
            >
              <Icon name="trash" size="sm" ariaHidden />
              <span>Xóa</span>
            </button>
          </div>

          {processing && (
            <div className="uploader-overlay-loading">
              <VectorSpinner size={28} color="#ffffff" />
              <span className="text-xs font-semibold text-white mt-1">Đang tải lên Supabase Storage...</span>
            </div>
          )}

          {compressionStats && (
            <div className="uploader-stats-badge flex items-center gap-1" title="Thông số ảnh đã tự động tối ưu qua Supabase Storage">
              <Icon name="zap" size="xs" ariaHidden />
              <span>Đã tối ưu: {formatFileSize(compressionStats.originalSize)} &rarr;{' '}
              {formatFileSize(compressionStats.compressedSize)} ({compressionStats.format},{' '}
              {compressionStats.width}x{compressionStats.height}){' '}</span>
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
              <VectorSpinner size={32} />
              <p className="font-semibold text-sm mt-05">Đang xử lý & tải lên Supabase Storage...</p>
              <p className="muted text-xs">Tự động nén WebP và lưu trữ đám mây</p>
            </div>
          ) : (
            <div className="uploader-empty-state">
              <div className="uploader-icon">
                <Icon name="image" size="2xl" color="var(--teal-600, #0d9488)" />
              </div>
              <p className="uploader-prompt">
                <strong>Nhấp để chọn ảnh</strong> hoặc kéo thả tệp ảnh vào đây
              </p>
              <p className="uploader-subtext">
                Hỗ trợ <strong>PNG, JPG, WebP</strong> • Tối đa <strong>10MB</strong> • Lưu trữ đám mây Supabase Storage
              </p>
              <div className="uploader-restriction-pill flex items-center justify-center gap-1">
                <Icon name="alert-circle" size="xs" ariaHidden />
                <span>Không hỗ trợ tệp Video & tệp PDF</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ImageUploader;
