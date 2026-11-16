import React, { useState } from 'react';
import { api } from '../../services/api';

export const OrganizerCheckinTab = ({ selectedEvent, attendees = [], onCheckinSuccess, notify }) => {
  const [barcode, setBarcode] = useState('');
  const [checkingIn, setCheckingIn] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  if (!selectedEvent) {
    return (
      <div className="card p-xl text-center text-muted">
        Vui lòng chọn sự kiện để bắt đầu soát vé.
      </div>
    );
  }

  const checkedInCount = attendees.filter((a) => a.status === 'CHECKED_IN').length;
  const checkinRate = attendees.length > 0 ? Math.round((checkedInCount / attendees.length) * 100) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanCode = barcode.trim();
    if (!cleanCode) return;

    setCheckingIn(true);
    setResult(null);

    try {
      const res = await api.post(`/api/events/${selectedEvent.id}/checkin`, { barcode: cleanCode });
      const successData = {
        success: true,
        message: res.message || 'Check-in thành công!',
        attendee: res.attendee,
        time: new Date().toLocaleTimeString('vi-VN'),
      };
      setResult(successData);
      setHistory((prev) => [successData, ...prev]);
      setBarcode('');
      if (onCheckinSuccess) onCheckinSuccess();
    } catch (err) {
      const failData = {
        success: false,
        error: err.response?.data?.error || err.message || 'Mã vé không hợp lệ hoặc đã qua sử dụng',
        barcode: cleanCode,
        time: new Date().toLocaleTimeString('vi-VN'),
      };
      setResult(failData);
      setHistory((prev) => [failData, ...prev]);
    } finally {
      setCheckingIn(false);
    }
  };

  return (
    <div className="stack gap-md">
      <section className="card p-lg">
        <div className="flex flex-wrap items-center justify-between gap-md mb-md pb-sm border-b">
          <div>
            <h2 className="panel-title m-0">Soát Vé Tại Cổng (Live QR / Barcode Check-in)</h2>
            <p className="muted text-sm mt-xs">
              Sự kiện: <strong>{selectedEvent.title}</strong> · Nhập mã Barcode hoặc quét mã QR từ vé.
            </p>
          </div>
          <div>
            <span className="badge badge-primary text-sm font-bold">
              Đã soát: {checkedInCount} / {attendees.length} vé ({checkinRate}%)
            </span>
          </div>
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="flex gap-sm max-w-xl mx-auto my-md">
          <input
            type="text"
            className="input input-full text-base font-mono font-bold"
            placeholder="Nhập hoặc quét mã vé (VD: TKT-1-101-ABC)..."
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            className="btn btn-primary whitespace-nowrap px-lg"
            disabled={checkingIn || !barcode.trim()}
          >
            {checkingIn ? 'Đang kiểm tra...' : 'Xác Thực Vé'}
          </button>
        </form>

        {/* Check-in Result */}
        {result && (
          <div
            className={`p-md rounded-xl max-w-xl mx-auto my-md border text-center ${
              result.success
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 text-emerald-900 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 text-rose-900 dark:text-rose-200'
            }`}
          >
            {result.success ? (
              <div>
                <span className="text-2xl d-block mb-xs">CHECK-IN HỢP LỆ!</span>
                <strong className="text-base d-block">{result.attendee?.name}</strong>
                <span className="text-xs d-block muted">{result.attendee?.email}</span>
                <div className="flex justify-center gap-xs mt-xs">
                  <span className="badge badge-success text-xs">Trạng thái: CHECKED_IN</span>
                  <span className="badge badge-info text-xs font-mono">{result.attendee?.barcode}</span>
                </div>
                <span className="text-xs muted d-block mt-xs">Thời gian: {result.time}</span>
              </div>
            ) : (
              <div>
                <span className="text-2xl d-block mb-xs">KHÔNG THỂ CHECK-IN!</span>
                <strong className="text-sm d-block text-danger">{result.error}</strong>
                <span className="font-mono text-xs muted d-block mt-xs">Mã đã quét: {result.barcode}</span>
              </div>
            )}
          </div>
        )}

        {/* Recent Check-in Feed */}
        {history.length > 0 && (
          <div className="mt-lg pt-md border-t max-w-xl mx-auto">
            <h3 className="text-sm font-semibold mb-sm">Lịch sử soát vé phiên này</h3>
            <div className="stack gap-xs max-h-48 overflow-y-auto">
              {history.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-xs rounded text-xs flex justify-between items-center ${
                    item.success
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/20'
                      : 'bg-rose-50/60 dark:bg-rose-950/20'
                  }`}
                >
                  <div>
                    <strong>{item.attendee?.name || item.barcode}</strong>
                    <span className="muted text-xs ml-xs">({item.time})</span>
                  </div>
                  <span className={`badge text-xs ${item.success ? 'badge-success' : 'badge-danger'}`}>
                    {item.success ? 'HỢP LỆ' : 'TỪ CHỐI'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default OrganizerCheckinTab;
