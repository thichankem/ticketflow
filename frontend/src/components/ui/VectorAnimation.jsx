import React, { useId } from 'react';

/**
 * 1. VectorSpinner
 * Pure scalable SVG loader with smooth stroke-dasharray animation.
 * Replaces crude CSS border spinners with crisp, high-performance vector motion.
 */
export const VectorSpinner = ({
  size = 28,
  color = 'var(--primary, #0f766e)',
  className = '',
  ariaLabel = 'Đang tải...',
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      className={`tf-vector-spinner ${className}`}
      role="status"
      aria-label={ariaLabel}
    >
      <circle
        cx="20"
        cy="20"
        r="16"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeOpacity="0.15"
      />
      <circle
        cx="20"
        cy="20"
        r="16"
        stroke={color}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="75 100"
        className="tf-spinner-dash"
      />
    </svg>
  );
};

/**
 * 2. SuccessVectorAnimation
 * Celebratory vector badge with ticket perforation notch motifs and animated checkmark.
 * Replaces static Unicode checkmarks.
 */
export const SuccessVectorAnimation = ({
  size = 64,
  className = '',
  ariaLabel = 'Thành công',
}) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `tf-success-grad-${uid}`;
  const shadowId = `tf-success-shadow-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={`tf-success-vector ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <filter id={shadowId} x="2" y="2" width="60" height="60" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#10b981" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Ticket-notched Outer Stamp Circle */}
      <circle
        cx="32"
        cy="32"
        r="28"
        fill={`url(#${gradId})`}
        filter={`url(#${shadowId})`}
        className="tf-success-circle"
      />

      {/* Subtle Perforation Ring */}
      <circle
        cx="32"
        cy="32"
        r="22"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />

      {/* Dynamic Animated Checkmark Vector */}
      <path
        d="M20 33 L28 41 L44 23"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="tf-success-check"
      />
    </svg>
  );
};

/**
 * 3. PendingPaymentAnimation
 * Animated hourglass/pulse vector graphic for PENDING_PAYMENT orders.
 * Replaces static emoji timers.
 */
export const PendingPaymentAnimation = ({
  size = 64,
  className = '',
  ariaLabel = 'Đang chờ xác nhận thanh toán',
}) => {
  const uid = useId().replace(/:/g, '');
  const gradId = `tf-pending-grad-${uid}`;
  const shadowId = `tf-pending-shadow-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={`tf-pending-vector ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <filter id={shadowId} x="2" y="2" width="60" height="60" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#f59e0b" floodOpacity="0.3" />
        </filter>
      </defs>

      <circle
        cx="32"
        cy="32"
        r="28"
        fill={`url(#${gradId})`}
        filter={`url(#${shadowId})`}
        className="tf-pending-circle"
      />

      {/* Animated Hourglass Geometry */}
      <g className="tf-hourglass-icon" transform="translate(18, 18)">
        <path
          d="M 5 6 L 23 6 L 23 9 L 16 14 L 23 19 L 23 22 L 5 22 L 5 19 L 12 14 L 5 9 Z"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="9" y1="18" x2="19" y2="18" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="14" cy="11" r="1.5" fill="#ffffff" className="tf-sand-trickle" />
      </g>
    </svg>
  );
};

/**
 * 4. ReservationCountdownAnimation
 * Ticking vector ring for 15-minute checkout reservation hold.
 */
export const ReservationCountdownAnimation = ({
  size = 32,
  progress = 0.75,
  className = '',
  ariaLabel = 'Thời gian giữ vé còn lại',
}) => {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 36 36"
      width={size}
      height={size}
      fill="none"
      className={`tf-countdown-vector ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(progress * 100)}
      aria-label={ariaLabel}
    >
      <circle
        cx="18"
        cy="18"
        r={radius}
        stroke="var(--border-default, #e2e8f0)"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={radius}
        stroke="var(--amber-500, #f59e0b)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={strokeDashoffset}
        transform="rotate(-90 18 18)"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
      <line x1="18" y1="11" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="18" y1="18" x2="22" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
};

/**
 * 5. StatusFeedbackAnimation
 * Dynamic state badge with subtle radial pulse for warnings, errors or confirmations.
 */
export const StatusFeedbackAnimation = ({
  status = 'error',
  size = 40,
  className = '',
  ariaLabel,
}) => {
  const isError = status === 'error';
  const color = isError ? '#ef4444' : '#f59e0b';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      width={size}
      height={size}
      fill="none"
      className={`tf-status-feedback ${className}`}
      role="img"
      aria-label={ariaLabel || (isError ? 'Lỗi' : 'Cảnh báo')}
    >
      <circle cx="20" cy="20" r="16" fill={color} fillOpacity="0.15" className="tf-status-pulse" />
      <circle cx="20" cy="20" r="12" fill={color} />
      {isError ? (
        <path d="M16 16 L24 24 M24 16 L16 24" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
      ) : (
        <>
          <line x1="20" y1="14" x2="20" y2="21" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="20" cy="25" r="1.25" fill="#ffffff" />
        </>
      )}
    </svg>
  );
};
