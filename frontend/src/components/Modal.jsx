import React, { useEffect, useRef } from 'react';

/**
 * Reusable Popup Modal with Backdrop & Keyboard / Outside Click Dismissal
 */
export const Modal = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
  showCloseButton = true,
}) => {
  const modalRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass =
    size === 'sm'
      ? 'max-w-md'
      : size === 'lg'
      ? 'modal-container-lg'
      : size === 'xl'
      ? 'modal-container-lg max-w-4xl'
      : 'max-w-xl';

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-headline"
    >
      <div className={`modal-container ${maxWidthClass}`} ref={modalRef}>
        {(title || showCloseButton) && (
          <div className="modal-header-bar">
            <div>
              {title && <h3 id="modal-headline">{title}</h3>}
              {subtitle && <p className="text-xs text-muted mt-1 m-0">{subtitle}</p>}
            </div>
            {showCloseButton && (
              <button
                type="button"
                className="modal-close-icon"
                onClick={onClose}
                aria-label="Đóng cửa sổ popup"
              >
                ✕
              </button>
            )}
          </div>
        )}

        <div className="modal-body-content">{children}</div>

        {footer && <div className="modal-footer-bar">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
