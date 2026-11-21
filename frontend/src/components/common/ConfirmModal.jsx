import React from 'react';
import { Modal } from '../Modal';

/**
 * Reusable Confirmation Dialog for high-impact or destructive operations.
 */
export const ConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  title = 'Xác nhận thao tác',
  message,
  confirmText = 'Xác nhận',
  cancelText = 'Hủy bỏ',
  isDanger = false,
  loading = false,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={loading ? undefined : onClose}
      title={title}
      showCloseButton={!loading}
    >
      <div style={{ padding: '0.5rem 0' }}>
        {message && (
          <p style={{ margin: '0 0 1rem 0', lineHeight: 1.5, color: 'var(--text-main, #1e293b)' }}>
            {message}
          </p>
        )}
        {children}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '1.5rem',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn ${isDanger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Đang xử lý...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConfirmModal;
