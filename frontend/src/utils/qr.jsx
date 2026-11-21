import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

/**
 * Standard ISO/IEC 18004 Vector SVG QR Code Component (UI-27)
 */
export const QrCodeSvg = ({ value, size = 160, className = '' }) => {
  const [svgMarkup, setSvgMarkup] = useState('');

  useEffect(() => {
    if (!value) {
      setSvgMarkup('');
      return;
    }

    let isMounted = true;
    QRCode.toString(String(value), {
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

  if (!value) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`qr-code-unavailable inline-flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-lg p-2 text-center text-xs border ${className}`}
        aria-label="Mã QR chưa khả dụng"
      >
        <span className="font-mono text-xs font-bold">MÃ QR</span>
        <span className="text-2xs text-muted mt-1">Chưa khả dụng</span>
      </div>
    );
  }

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
          Đang tải QR...
        </text>
      </svg>
    );
  }

  return (
    <div
      className={`qr-code-container inline-block bg-white rounded-lg p-1.5 shadow-sm ${className}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
      aria-label={`QR Code for ${value}`}
    />
  );
};

export default QrCodeSvg;
