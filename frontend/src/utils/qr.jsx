import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

/**
 * Standard ISO/IEC 18004 QR Code Component
 */
export const QrCodeSvg = ({ value, size = 160, className = '' }) => {
  const [dataUrl, setDataUrl] = useState('');

  useEffect(() => {
    let isMounted = true;
    QRCode.toDataURL(String(value || 'TICKETFLOW'), {
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (isMounted) setDataUrl(url);
      })
      .catch((err) => {
        console.error('[QrCode] Generation error:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [value, size]);

  if (!dataUrl) {
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
    <img
      src={dataUrl}
      alt={`QR Code for ${value}`}
      width={size}
      height={size}
      className={`qr-code-img inline-block bg-white p-1 rounded-lg shadow-sm border border-slate-100 dark:border-slate-800 ${className}`}
    />
  );
};

export default QrCodeSvg;
