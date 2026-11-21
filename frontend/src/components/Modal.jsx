import React, { useEffect, useRef, useId } from 'react';
import { Icon } from './ui/Icon';

/**
 * Reusable Popup Modal with Backdrop, Focus Trap, Focus Restore & Keyboard Dismissal (UI-18)
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
  const previousFocusRef = useRef(null);
  const headingId = useId();

  useEffect(() => {
    if (!isOpen) return;

    // Save previously focused element and original overflow style to restore upon close
    previousFocusRef.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first interactive element or modal container
    const timer = setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation();
        if (typeof onClose === 'function') onClose();
        return;
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      if (originalOverflow && originalOverflow !== 'hidden') {
        document.body.style.overflow = originalOverflow;
      } else {
        document.body.style.overflow = '';
      }
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to trigger element safely
      try {
        if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
          previousFocusRef.current.focus();
        }
      } catch {}
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
          if (typeof onClose === 'function') onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? headingId : undefined}
      aria-label={!title ? 'Hộp thoại' : undefined}
    >
      <div className={`modal-container ${maxWidthClass}`} ref={modalRef} tabIndex={-1}>
        {(title || showCloseButton) && (
          <div className="modal-header-bar">
            <div>
              {title && <h2 id={headingId} className="modal-title-text text-lg font-bold">{title}</h2>}
              {subtitle && <p className="text-xs text-muted mt-1 m-0">{subtitle}</p>}
            </div>
            {showCloseButton && (
              <button
                type="button"
                className="modal-close-icon flex items-center justify-center"
                onClick={() => {
                  if (typeof onClose === 'function') onClose();
                }}
                aria-label="Đóng cửa sổ popup"
              >
                <Icon name="x" size="md" ariaHidden />
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
