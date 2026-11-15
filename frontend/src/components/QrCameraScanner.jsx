import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * Production-ready Live Camera QR Scanner Component
 * Compliant with SPEC.md REQ-ORG-08 / REQ-ORG-09, AUDIT_REPORT.md DEF-FE-03.
 * Zero inline styles: 100% styled via CSS classes in index.css.
 */
export const QrCameraScanner = ({
  onScan,
  isVerifying = false,
  cooldownMs = 2500,
  autoStart = false,
  manualInput = '',
  onManualInputChange = () => {},
  onManualSubmit = () => {},
}) => {
  const [activeTab, setActiveTab] = useState('camera'); // 'camera' | 'manual' | 'file'
  const [cameraActive, setCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) | 'user' (front)
  const [errorMessage, setErrorMessage] = useState(null);
  const [flashSuccess, setFlashSuccess] = useState(false);
  const [lastScannedText, setLastScannedText] = useState(null);

  const scannerRef = useRef(null);
  const isMountedRef = useRef(true);
  const lastScanTimeRef = useRef(0);
  const lastScannedCodeRef = useRef('');
  const viewportId = 'tf-qr-camera-viewport';

  // Pleasant Web Audio synthesizer for scan confirmation (zero external audio files)
  const playSuccessChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // 880Hz (A5)
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (_) {}
  }, []);

  // Scan handler with cooldown anti-flood protection
  const handleScanSuccess = useCallback(
    (decodedText) => {
      const cleanCode = (decodedText || '').trim();
      if (!cleanCode || isVerifying) return;

      const now = Date.now();
      if (
        lastScannedCodeRef.current === cleanCode &&
        now - lastScanTimeRef.current < cooldownMs
      ) {
        return; // Suppress duplicate scan within cooldown window
      }

      lastScannedCodeRef.current = cleanCode;
      lastScanTimeRef.current = now;
      setLastScannedText(cleanCode);

      // Feedback
      playSuccessChime();
      setFlashSuccess(true);
      setTimeout(() => {
        if (isMountedRef.current) setFlashSuccess(false);
      }, 700);

      if (onScan) {
        onScan(cleanCode);
      }
    },
    [isVerifying, cooldownMs, onScan, playSuccessChime]
  );

  // Start Camera Stream
  const startCamera = async (cameraConfig = null) => {
    if (!scannerRef.current || isStarting) return;
    try {
      setIsStarting(true);
      setErrorMessage(null);

      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }

      const config = cameraConfig || (selectedCameraId ? selectedCameraId : { facingMode });

      await scannerRef.current.start(
        config,
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minDim = Math.min(viewfinderWidth, viewfinderHeight);
            const boxSize = Math.max(180, Math.floor(minDim * 0.72));
            return { width: boxSize, height: boxSize };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => handleScanSuccess(decodedText),
        () => {} // Frame error callback: intentionally silent
      );

      if (isMountedRef.current) {
        setCameraActive(true);
      }
    } catch (err) {
      console.warn('[QrCameraScanner] Start error:', err);
      if (isMountedRef.current) {
        setCameraActive(false);
        const errStr = String(err?.message || err);
        if (errStr.includes('NotAllowedError') || errStr.includes('Permission denied')) {
          setErrorMessage('Quyền truy cập Camera bị từ chối. Vui lòng cấp quyền trong cài đặt trình duyệt hoặc chuyển sang tab "Nhập thủ công".');
        } else if (errStr.includes('NotFoundError') || errStr.includes('no camera')) {
          setErrorMessage('Không tìm thấy thiết bị Camera trên thiết bị này. Vui lòng sử dụng tab "Nhập thủ công" hoặc "Tải ảnh QR".');
        } else if (errStr.includes('NotReadableError') || errStr.includes('busy')) {
          setErrorMessage('Camera đang được ứng dụng khác sử dụng hoặc bị khóa. Vui lòng tắt các ứng dụng khác và thử lại.');
        } else {
          setErrorMessage(`Không thể kết nối camera: ${errStr}`);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsStarting(false);
      }
    }
  };

  // Stop Camera Stream
  const stopCamera = async () => {
    if (!scannerRef.current) return;
    try {
      if (scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      if (isMountedRef.current) {
        setCameraActive(false);
      }
    } catch (err) {
      console.warn('[QrCameraScanner] Stop error:', err);
    }
  };

  // Flip Camera Lens (Front / Back)
  const toggleFacingMode = async () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    setSelectedCameraId('');
    if (cameraActive) {
      await startCamera({ facingMode: nextFacing });
    }
  };

  // Switch specific camera device
  const handleDeviceChange = async (e) => {
    const deviceId = e.target.value;
    setSelectedCameraId(deviceId);
    if (cameraActive) {
      await startCamera(deviceId);
    }
  };

  // File Upload QR Decoder
  const handleFileScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !scannerRef.current) return;
    try {
      setErrorMessage(null);
      const decodedText = await scannerRef.current.scanFile(file, false);
      if (decodedText) {
        handleScanSuccess(decodedText);
      }
    } catch (err) {
      setErrorMessage('Không tìm thấy mã QR hợp lệ trong ảnh đã chọn. Vui lòng tải lên ảnh chụp QR rõ nét hơn.');
    } finally {
      e.target.value = '';
    }
  };

  // Lifecycle Initialization and Unmount Cleanup
  useEffect(() => {
    isMountedRef.current = true;
    const scanner = new Html5Qrcode(viewportId);
    scannerRef.current = scanner;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (isMountedRef.current && devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera if available
          const backCam = devices.find((d) => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('rear'));
          if (backCam) {
            setSelectedCameraId(backCam.id);
          } else {
            setSelectedCameraId(devices[0].id);
          }
        }
      })
      .catch(() => {});

    if (autoStart) {
      startCamera();
    }

    return () => {
      isMountedRef.current = false;
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current
            .stop()
            .then(() => {
              try { scannerRef.current.clear(); } catch (_) {}
            })
            .catch(() => {});
        } else {
          try { scannerRef.current.clear(); } catch (_) {}
        }
      }
    };
  }, []);

  return (
    <div className="door-scanner-console-card">
      {/* Scanner Mode Tabs */}
      <div className="door-scanner-tabs-bar">
        <button
          type="button"
          className={`door-scanner-tab-btn ${activeTab === 'camera' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('camera');
            setErrorMessage(null);
          }}
        >
          📷 Quét Camera Trực Tiếp
        </button>
        <button
          type="button"
          className={`door-scanner-tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('manual');
            stopCamera();
          }}
        >
          ⌨️ Nhập Mã Thủ Công
        </button>
        <button
          type="button"
          className={`door-scanner-tab-btn ${activeTab === 'file' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('file');
            stopCamera();
          }}
        >
          📁 Tải File Ảnh QR
        </button>
      </div>

      {/* Mode 1: Live Video Camera Viewport */}
      {activeTab === 'camera' && (
        <div className="door-camera-section">
          <div className={`door-camera-viewport-container ${flashSuccess ? 'scan-flash-success' : ''}`}>
            {/* Target DOM Element for Html5Qrcode video/canvas */}
            <div id={viewportId} className="door-camera-video-frame" />

            {/* Scanning Viewfinder Reticle Overlay */}
            {cameraActive && (
              <div className="door-camera-reticle" aria-hidden="true">
                <div className="reticle-corner corner-top-left" />
                <div className="reticle-corner corner-top-right" />
                <div className="reticle-corner corner-bottom-left" />
                <div className="reticle-corner corner-bottom-right" />
                <div className="reticle-laser-line" />
                <div className="reticle-aim-label">
                  {isVerifying ? 'Đang xác thực vé...' : 'Căn chỉnh mã QR vào khung ngắm'}
                </div>
              </div>
            )}

            {/* Offline / Idle Placeholder */}
            {!cameraActive && !isStarting && (
              <div className="door-camera-idle-placeholder">
                <span className="camera-idle-icon">📷</span>
                <p className="camera-idle-title">Camera đang tạm dừng</p>
                <p className="camera-idle-desc">Bấm nút bên dưới để khởi động camera và bắt đầu soát vé</p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => startCamera()}
                >
                  ▶️ Bắt Đầu Quét Camera
                </button>
              </div>
            )}

            {/* Loading / Connecting State */}
            {isStarting && (
              <div className="door-camera-loading-overlay">
                <div className="loading-spinner" />
                <p>Đang kết nối luồng video camera...</p>
              </div>
            )}
          </div>

          {/* Camera Toolbar Controls */}
          <div className="door-camera-toolbar">
            {cameraActive ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={stopCamera}
              >
                ⏸️ Tạm Dừng Camera
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => startCamera()}
                disabled={isStarting}
              >
                ▶️ Bật Camera
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={toggleFacingMode}
              title="Đổi camera trước / sau"
            >
              🔄 Đổi Camera ({facingMode === 'environment' ? 'Sau' : 'Trước'})
            </button>

            {cameras.length > 1 && (
              <select
                className="select select-compact text-xs"
                value={selectedCameraId}
                onChange={handleDeviceChange}
                aria-label="Chọn thiết bị camera"
              >
                {cameras.map((c, i) => (
                  <option key={c.id} value={c.id}>
                    {c.label || `Camera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Manual Text Input Fallback */}
      {activeTab === 'manual' && (
        <form onSubmit={onManualSubmit} className="door-manual-form">
          <p className="door-manual-hint">
            Nhập mã vé (ví dụ: <code>TKT-100-200</code> hoặc chuỗi barcode) rồi bấm Soát Vé.
          </p>
          <div className="door-manual-input-row">
            <input
              type="text"
              placeholder="Nhập mã vé hoặc dán chuỗi barcode..."
              className="form-control font-mono text-sm uppercase flex-1"
              value={manualInput}
              onChange={(e) => onManualInputChange(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              disabled={isVerifying || !manualInput.trim()}
              className="btn btn-primary"
            >
              {isVerifying ? 'Đang xác thực...' : 'Soát Vé (Check-in)'}
            </button>
          </div>
        </form>
      )}

      {/* Mode 3: Upload Image File QR Fallback */}
      {activeTab === 'file' && (
        <div className="door-file-section">
          <p className="door-file-hint">
            Tải lên ảnh chụp màn hình hoặc hình ảnh chứa mã QR để hệ thống tự động giải mã và soát vé.
          </p>
          <label className="door-file-dropzone">
            <span className="dropzone-icon">🖼️</span>
            <span className="dropzone-label">Nhấn để chọn file ảnh QR (.png, .jpg, .webp)</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleFileScan}
            />
          </label>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="door-scanner-error-banner" role="alert">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            className="btn btn-secondary btn-sm ml-sm"
            onClick={() => {
              setErrorMessage(null);
              startCamera();
            }}
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Last Scanned Feedback Pill */}
      {lastScannedText && (
        <div className="door-scanner-scanned-pill">
          <span className="scanned-pill-label">Mã vừa quét:</span>
          <code className="scanned-pill-code">{lastScannedText}</code>
        </div>
      )}
    </div>
  );
};

export default QrCameraScanner;
