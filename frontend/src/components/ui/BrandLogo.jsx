import React, { useId } from 'react';

/**
 * TicketFlow Canonical Brand Logo & Mark
 * 100% Original Scalable Vector Graphic (SVG) with custom ticket silhouette and flow geometry.
 */
export const BrandMark = ({ size = 34, className = '', ariaHidden = true }) => {
  const uid = useId().replace(/:/g, '');
  const bgGradId = `tf-mark-bg-${uid}`;
  const flowGradId = `tf-mark-flow-${uid}`;
  const accentGradId = `tf-mark-accent-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      className={`brand-mark-svg ${className}`}
      aria-hidden={ariaHidden}
      role={ariaHidden ? 'presentation' : 'img'}
    >
      <defs>
        <linearGradient id={bgGradId} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#115e59" />
        </linearGradient>
        <linearGradient id={flowGradId} x1="12" y1="14" x2="36" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="50%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#14b8a6" />
        </linearGradient>
        <linearGradient id={accentGradId} x1="28" y1="12" x2="38" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* Ticket Silhouette Background with Precision Perforations */}
      <path
        d="M 10 6
           C 6.686 6 4 8.686 4 12
           L 4 20
           C 6.209 20 8 21.791 8 24
           C 8 26.209 6.209 28 4 28
           L 4 36
           C 4 39.314 6.686 42 10 42
           L 38 42
           C 41.314 42 44 39.314 44 36
           L 44 28
           C 41.791 28 40 26.209 40 24
           C 40 21.791 41.791 20 44 20
           L 44 12
           C 44 8.686 41.314 6 38 6
           Z"
        fill={`url(#${bgGradId})`}
      />

      {/* Subtle Dashed Perforation Line */}
      <line
        x1="24"
        y1="7"
        x2="24"
        y2="41"
        stroke="#5eead4"
        strokeOpacity="0.25"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray="2 3"
      />

      {/* TicketFlow "T" + "F" Stream Ribbon Geometry */}
      <g>
        {/* Top Horizontal Header Bar of Ticket ("T") */}
        <path
          d="M 13 15 C 13 13.895 13.895 13 15 13 L 33 13 C 34.105 13 35 13.895 35 15 C 35 16.105 34.105 17 33 17 L 15 17 C 13.895 17 13 16.105 13 15 Z"
          fill={`url(#${flowGradId})`}
        />

        {/* Dynamic Flowing Center Stem & Lower Flow Loop ("Flow") */}
        <path
          d="M 21 17
             L 27 17
             L 27 25
             C 27 28.314 24.314 31 21 31
             L 16 31
             C 14.895 31 14 30.105 14 29
             C 14 27.895 14.895 27 16 27
             L 21 27
             C 22.105 27 23 26.105 23 25
             L 23 17
             Z"
          fill={`url(#${flowGradId})`}
        />

        {/* Secondary Forward Stream Notch ("F" accent line) */}
        <path
          d="M 27 21 L 33 21 C 34.105 21 35 21.895 35 23 C 35 24.105 34.105 25 33 25 L 27 25 Z"
          fill={`url(#${flowGradId})`}
          fillOpacity="0.9"
        />

        {/* Dynamic Amber Ticket Spark / Verified Holographic Seal */}
        <circle cx="34" cy="15" r="2.5" fill={`url(#${accentGradId})`} />
      </g>
    </svg>
  );
};

export const BrandLogo = ({
  size = 34,
  showSubtag = true,
  subtagText = 'Vé Sự Kiện Trực Tuyến',
  className = '',
}) => {
  return (
    <div className={`brand-logo-container ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
      <BrandMark size={size} />
      <div className="logo-text">
        <span className="brand-name font-bold tracking-tight">Ticketflow</span>
        {showSubtag && subtagText && (
          <span className="portal-subtag">{subtagText}</span>
        )}
      </div>
    </div>
  );
};

export default BrandMark;
