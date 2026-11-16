import React, { useState, useRef } from 'react';
import { compressAndResizeImage, formatFileSize, validateImageFile } from '../utils/imageOptimizer';

export const ImageUploader = ({
  id = 'image-uploader',
  label = 'Tải ảnh lên',
  hint = '',
  value = '',
  onChange = () => {},
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
  const fileInputRef = useRef(null);

  const handleProcessFile = async (file) => {
    if (!file) return;
    setErrorMessage(null);
    setProcessing(true);

    try {
      // Validate first (strictly checks for video and PDF)
      validateImageFile(file);

      // Compress and resize
      const result = await compressAndResizeImage(file, {
        maxWidth,
        maxHeight,
        quality,
        targetFormat: 'image/webp',
      });

      setCompressionStats(result);
      onChange(result.dataUrl, result);
    } catch (err) {
      setErrorMessage(err.message || 'Không thể xử lý hình ảnh');
    } finally {
      setProcessing(false);
    }
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    // Reset file input so re-selecting same file triggers change
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

  const handleClear = () => {
    onChange('', null);
    setCompressionStats(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="image-uploader-wrapper">
      <div className="flex justify-between items-center mb-025">
        <label htmlFor={id} className="font-semibold text-sm m-0">
          {label} {required && <span className="text-danger">*</span>}
        </label>
        {value && (
          <button
            type="button"
            className="btn btn-ghost btn-xs text-danger"
            onClick={handleClear}
            title="Xóa hình ảnh này"
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

      {/* Error alert if forbidden format or size was selected */}
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
      {value ? (
        <div className={`uploader-preview-card aspect-${aspect}`}>
          <img
            src={value}
            alt={label}
            className="uploader-preview-img"
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

          {compressionStats && (
            <div className="uploader-stats-badge" title="Thông số ảnh đã tự động tối ưu">
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
              <p className="font-semibold text-sm mt-05">Đang xử lý & ép định dạng, kích cỡ ảnh...</p>
              <p className="muted text-xs">Tự động chuyển đổi sang WebP chuẩn nén cao</p>
            </div>
          ) : (
            <div className="uploader-empty-state">
              <div className="uploader-icon">🖼️</div>
              <p className="uploader-prompt">
                <strong>Nhấp để chọn ảnh</strong> hoặc kéo thả tệp ảnh vào đây
              </p>
              <p className="uploader-subtext">
                Hỗ trợ <strong>PNG, JPG, WebP</strong> • Tối đa <strong>10MB</strong> • Tự động ép kích cỡ & định dạng
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
