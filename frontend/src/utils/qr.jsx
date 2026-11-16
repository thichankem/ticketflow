import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

/**
 * Standard ISO/IEC 18004 Vector SVG QR Code Component (SPEC-ISSUE-011)
 */
export const QrCodeSvg = ({ value, size = 160, className = '' }) => {
  const [svgMarkup, setSvgMarkup] = useState('');

  useEffect(() => {
    let isMounted = true;
    QRCode.toString(String(value || 'TICKETFLOW'), {
      type: 'svg',
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((svg) => {
        if (isMounted) setSvgMarkup(svg);
      })
      .catch((err) => {
        console.error('[QrCodeSvg] Generation error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [value, size]);

  if (!svgMarkup) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={`qr-code-placeholder inline-block bg-white rounded-lg p-2 shadow-sm ${className}`}
        aria-label={`QR Code placeholder for ${value}`}
      >
        <rect width="100%" height="100%" fill="#f8fafc" rx="8" />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="12"
          fontFamily="monospace"
        >
          Loading QR...
        </text>
      </svg>
    );
  }

  return (
    <div
      className={`qr-code-svg-container inline-block bg-white p-1 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 ${className}`}
      style={{ width: size, height: size }}
      aria-label={`QR Code for ${value}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
};

export default QrCodeSvg;
