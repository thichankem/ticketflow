import React, { useId } from 'react';

/**
 * 100% Scalable Original Vector Illustrations for Empty States
 * Free of raster assets, perfectly sharp at 200%+ zoom, adapts to light/dark themes.
 */
export const EmptyStateIllustration = ({
  type = 'empty-tickets',
  size = 120,
  className = '',
  ariaLabel,
}) => {
  const uid = useId().replace(/:/g, '');
  const isDecorative = !ariaLabel;

  // 1. No Tickets State (Ticket Stubs & Perforations)
  if (type === 'empty-tickets' || type === 'no-tickets') {
    const bgGradId = `tf-et-bg-${uid}`;
    const cardGradId = `tf-et-card-${uid}`;

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <defs>
          <linearGradient id={bgGradId} x1="20" y1="20" x2="140" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--teal-500, #14b8a6)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--teal-700, #0f766e)" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id={cardGradId} x1="30" y1="30" x2="130" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="var(--bg-surface, #ffffff)" />
            <stop offset="100%" stopColor="var(--bg-muted, #f1f5f9)" />
          </linearGradient>
        </defs>

        <circle cx="80" cy="60" r="50" fill={`url(#${bgGradId})`} filter="blur(16px)" />

        {/* Secondary Back Ticket (Slanted) */}
        <path
          d="M 45 32 C 45 28 48 25 52 25 L 120 25 C 124 25 127 28 127 32 L 127 48 C 124 48 122 50 122 53 C 122 56 124 58 127 58 L 127 74 C 127 78 124 81 120 81 L 52 81 C 48 81 45 78 45 74 L 45 58 C 48 58 50 56 50 53 C 50 50 48 48 45 48 Z"
          fill="var(--bg-muted, #f1f5f9)"
          stroke="var(--border-strong, #cbd5e1)"
          strokeWidth="1.5"
          transform="rotate(6 86 53)"
          strokeDasharray="4 2"
          opacity="0.6"
        />

        {/* Primary Foreground Ticket */}
        <path
          d="M 32 38 C 32 34 35 31 39 31 L 121 31 C 125 31 128 34 128 38 L 128 54 C 125 54 123 56 123 59 C 123 62 125 64 128 64 L 128 82 C 128 86 125 89 121 89 L 39 89 C 35 89 32 86 32 82 L 32 64 C 35 64 37 62 37 59 C 37 56 35 54 32 54 Z"
          fill={`url(#${cardGradId})`}
          stroke="var(--teal-600, #0d9488)"
          strokeWidth="2"
        />

        {/* Perforation Line */}
        <line
          x1="96"
          y1="33"
          x2="96"
          y2="87"
          stroke="var(--teal-500, #14b8a6)"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          strokeOpacity="0.7"
        />

        {/* Ticket Header & Text Placeholder Ribbons */}
        <rect x="42" y="42" width="40" height="7" rx="3.5" fill="var(--teal-600, #0d9488)" />
        <rect x="42" y="55" width="28" height="4" rx="2" fill="var(--text-muted, #94a3b8)" opacity="0.6" />
        <rect x="42" y="63" width="34" height="4" rx="2" fill="var(--text-muted, #94a3b8)" opacity="0.4" />
        <rect x="42" y="73" width="20" height="5" rx="2" fill="var(--amber-500, #f59e0b)" />

        {/* Stub Area QR Matrix Simulation */}
        <rect x="104" y="44" width="16" height="16" rx="2" stroke="var(--teal-600, #0d9488)" strokeWidth="1.5" fill="none" />
        <rect x="108" y="48" width="8" height="8" fill="var(--teal-700, #0f766e)" />
      </svg>
    );
  }

  // 2. Empty Cart State
  if (type === 'empty-cart') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <circle cx="80" cy="60" r="48" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />

        {/* Empty Shopping Cart Linework */}
        <path
          d="M 40 40 L 52 40 L 64 78 L 108 78 L 118 48 L 56 48"
          stroke="var(--teal-600, #0d9488)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="68" cy="90" r="6" stroke="var(--teal-600, #0d9488)" strokeWidth="2.5" />
        <circle cx="104" cy="90" r="6" stroke="var(--teal-600, #0d9488)" strokeWidth="2.5" />

        {/* Floating Ticket Stub hovering above cart */}
        <g transform="translate(70, 24) rotate(-8)">
          <rect
            x="0"
            y="0"
            width="32"
            height="18"
            rx="4"
            fill="var(--bg-surface, #ffffff)"
            stroke="var(--amber-500, #f59e0b)"
            strokeWidth="2"
          />
          <line x1="20" y1="2" x2="20" y2="16" stroke="var(--amber-500, #f59e0b)" strokeDasharray="2 2" />
        </g>
      </svg>
    );
  }

  // 3. Empty Notifications State
  if (type === 'empty-notifications' || type === 'no-notifications') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <circle cx="80" cy="60" r="46" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />

        {/* Sleek Inbox Envelope with Paper-Plane Vector */}
        <rect
          x="44"
          y="42"
          width="72"
          height="48"
          rx="8"
          fill="var(--bg-surface, #ffffff)"
          stroke="var(--teal-600, #0d9488)"
          strokeWidth="2.5"
        />
        <path
          d="M 46 45 L 80 69 L 114 45"
          stroke="var(--teal-600, #0d9488)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Floating Paper Plane */}
        <g transform="translate(90, 16) rotate(12)">
          <path
            d="M 0 12 L 28 0 L 16 26 L 12 16 Z"
            fill="var(--teal-400, #2dd4bf)"
            stroke="var(--teal-700, #0f766e)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    );
  }

  // 4. No Events State
  if (type === 'empty-events' || type === 'no-events') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <circle cx="80" cy="60" r="48" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />
        {/* Stage & Spotlight geometry */}
        <ellipse cx="80" cy="88" rx="46" ry="12" fill="var(--bg-muted, #f1f5f9)" stroke="var(--border, #cbd5e1)" strokeWidth="1.5" />
        <path d="M 46 22 L 56 86 M 114 22 L 104 86" stroke="var(--teal-500, #14b8a6)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
        <circle cx="80" cy="46" r="14" stroke="var(--teal-600, #0d9488)" strokeWidth="2.5" fill="var(--bg-surface, #ffffff)" />
        <polygon points="80 38 84 48 76 48" fill="var(--amber-500, #f59e0b)" />
        <line x1="80" y1="52" x2="80" y2="54" stroke="var(--amber-500, #f59e0b)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // 5. No Attendees State
  if (type === 'empty-attendees' || type === 'no-attendees') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <circle cx="80" cy="60" r="46" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />
        {/* Attendee Roster Card */}
        <rect x="45" y="30" width="70" height="64" rx="6" fill="var(--bg-surface, #ffffff)" stroke="var(--teal-600, #0d9488)" strokeWidth="2.5" />
        <circle cx="80" cy="50" r="10" stroke="var(--teal-600, #0d9488)" strokeWidth="2" fill="none" />
        <path d="M 64 74 C 64 68 71 65 80 65 C 89 65 96 68 96 74" stroke="var(--teal-600, #0d9488)" strokeWidth="2" fill="none" />
        <line x1="58" y1="84" x2="102" y2="84" stroke="var(--amber-500, #f59e0b)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // 6. No Transactions / Orders State
  if (type === 'empty-transactions' || type === 'no-transactions') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <circle cx="80" cy="60" r="46" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />
        {/* Receipt / Wallet with currency spark */}
        <rect x="48" y="38" width="64" height="44" rx="5" fill="var(--bg-surface, #ffffff)" stroke="var(--teal-600, #0d9488)" strokeWidth="2.5" />
        <line x1="48" y1="52" x2="112" y2="52" stroke="var(--teal-600, #0d9488)" strokeWidth="2" />
        <circle cx="80" cy="66" r="6" stroke="var(--amber-500, #f59e0b)" strokeWidth="2" fill="none" />
        <line x1="80" y1="62" x2="80" y2="70" stroke="var(--amber-500, #f59e0b)" strokeWidth="1.5" />
      </svg>
    );
  }

  // 7. No Analytics Data State
  if (type === 'empty-analytics' || type === 'no-analytics') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <circle cx="80" cy="60" r="46" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />
        {/* Grid and stepped chart bars */}
        <line x1="42" y1="88" x2="118" y2="88" stroke="var(--border, #cbd5e1)" strokeWidth="2" />
        <rect x="52" y="66" width="12" height="22" rx="2" fill="var(--teal-400, #2dd4bf)" opacity="0.5" />
        <rect x="74" y="52" width="12" height="36" rx="2" fill="var(--teal-500, #14b8a6)" opacity="0.7" />
        <rect x="96" y="40" width="12" height="48" rx="2" fill="var(--teal-700, #0f766e)" />
        <polyline points="58 60 80 44 102 32" stroke="var(--amber-500, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3 3" />
      </svg>
    );
  }

  // 8. Upload Empty State
  if (type === 'empty-upload' || type === 'upload-empty') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 160 120"
        width={size}
        height={(size * 120) / 160}
        fill="none"
        className={`tf-empty-illustration ${className}`}
        aria-hidden={isDecorative}
        aria-label={ariaLabel}
        role={isDecorative ? 'presentation' : 'img'}
      >
        <circle cx="80" cy="60" r="46" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />
        {/* Dashed cloud container with upload arrow */}
        <path
          d="M 54 74 A 16 16 0 0 1 68 46 A 24 24 0 0 1 106 50 A 16 16 0 0 1 114 74 Z"
          stroke="var(--teal-600, #0d9488)"
          strokeWidth="2.5"
          strokeDasharray="4 3"
          fill="var(--bg-surface, #ffffff)"
        />
        <polyline points="74 62 80 56 86 62" stroke="var(--amber-500, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="80" y1="56" x2="80" y2="76" stroke="var(--amber-500, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  // 9. Default Fallback: Empty Search / Results
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 160 120"
      width={size}
      height={(size * 120) / 160}
      fill="none"
      className={`tf-empty-illustration ${className}`}
      aria-hidden={isDecorative}
      aria-label={ariaLabel}
      role={isDecorative ? 'presentation' : 'img'}
    >
      <circle cx="80" cy="60" r="46" fill="var(--teal-500, #14b8a6)" fillOpacity="0.1" filter="blur(14px)" />

      {/* Modern Search Lens */}
      <circle
        cx="72"
        cy="54"
        r="24"
        fill="var(--bg-surface, #ffffff)"
        stroke="var(--teal-600, #0d9488)"
        strokeWidth="3"
      />
      <line
        x1="89"
        y1="71"
        x2="114"
        y2="96"
        stroke="var(--teal-700, #0f766e)"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Decorative Constellation Sparks */}
      <circle cx="65" cy="46" r="3" fill="var(--amber-400, #fbbf24)" />
      <circle cx="78" cy="58" r="2" fill="var(--teal-400, #2dd4bf)" />
    </svg>
  );
};

export default EmptyStateIllustration;
