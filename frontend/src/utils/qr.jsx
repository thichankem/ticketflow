import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';

/**
 * Deterministic pseudo-random generator seeded by string for Code 128-like Barcode
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

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

/**
 * Clean Vector Barcode Component
 */
export const BarcodeSvg = ({ value, width = 240, height = 54, className = '' }) => {
  const bars = useMemo(() => {
    const str = String(value || 'TKF-892147');
    let seed = hashString(str);
    const pattern = [];
    const charLen = Math.max(28, str.length * 4);

    for (let i = 0; i < charLen; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const barWidth = (seed % 3) + 1;
      pattern.push({ isBlack: i % 2 === 0, width: barWidth });
    }
    return pattern;
  }, [value]);

  const totalUnits = bars.reduce((sum, b) => sum + b.width, 0);

  let curX = 0;
  return (
    <div className={`barcode-container text-center ${className}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${totalUnits} 40`}
        preserveAspectRatio="none"
        className="block mx-auto bg-white p-1 rounded border border-slate-100"
      >
        {bars.map((bar, i) => {
          const x = curX;
          curX += bar.width;
          if (!bar.isBlack) return null;
          return <rect key={i} x={x} y="0" width={bar.width} height="40" fill="#0f172a" />;
        })}
      </svg>
      <div className="font-mono text-xs tracking-widest mt-1 text-slate-700 dark:text-slate-300 font-semibold">
        {value}
      </div>
    </div>
  );
};

export default QrCodeSvg;
