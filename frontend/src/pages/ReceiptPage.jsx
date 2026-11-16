import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { money, formatDateTime } from '../utils/display';
import { QrCodeSvg } from '../utils/qr';

export const ReceiptPage = () => {
  const { id } = useParams();
  const { t } = useLanguage();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchReceipt = async () => {
      try {
        const res = await api.orders.getReceipt(id);
        if (isMounted) setReceipt(res.receipt || res);
      } catch (err) {
        if (isMounted) setError(err.message || 'Không thể tải biên lai điện tử');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchReceipt();
    return () => { isMounted = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="card loading-state empty-state-card">
        <div className="spinner" />
        <p className="muted">Đang tải biên lai...</p>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="alert alert-error empty-state-card">
        <p>{error || 'Biên lai không tồn tại hoặc bạn không có quyền truy cập.'}</p>
        <Link to="/" className="btn btn-secondary btn-sm auth-switch-note">
          Quay lại trang chủ
        </Link>
      </div>
    );
  }

  return (
    <section className="receipt-page-view">
      <div className="receipt-page-container">
        <div className="receipt-header">
          <div className="receipt-icon-circle">✓</div>
          <span className="badge badge-success">{t('receipt.header_badge', 'Biên lai thanh toán')}</span>
          <h1 className="receipt-title">{t('receipt.headline', 'Biên lai thanh toán')}</h1>
          <p className="receipt-subtitle">
            {t('receipt.code_label', 'Mã biên lai:')} <strong>{receipt.receipt_id}</strong> · {t('receipt.order_label', 'Mã đơn:')} <strong>{receipt.order_short_id || receipt.order_id}</strong>
          </p>
        </div>

        <div className="card receipt-content-card">
          <div className="receipt-meta-grid">
            <div className="receipt-meta-cell">
              <span className="receipt-meta-label">{t('receipt.meta_event', 'SỰ KIỆN')}</span>
              <strong className="receipt-meta-val">{receipt.event?.title || 'Sự kiện Ticketflow'}</strong>
              <div className="muted">{receipt.event?.location || 'Trực tuyến'}</div>
            </div>
            <div className="receipt-meta-cell">
              <span className="receipt-meta-label">{t('receipt.meta_buyer', 'NGƯỜI MUA VÉ')}</span>
              <strong className="receipt-meta-val">{receipt.buyer?.name || 'Khách mua vé'}</strong>
              <div className="muted">{receipt.buyer?.email}</div>
            </div>
            <div className="receipt-meta-cell">
              <span className="receipt-meta-label">{t('receipt.meta_payment', 'THANH TOÁN')}</span>
              <span className="badge badge-success">{receipt.payment_status}</span>
              <div className="muted">{receipt.payment_gateway} · {receipt.transaction_id}</div>
            </div>
          </div>

          <h3>Chi tiết các hạng vé:</h3>
          <div className="receipt-table-wrapper">
            <table className="receipt-data-table">
              <thead>
                <tr>
                  <th>{t('receipt.tier_title', 'Hạng vé')}</th>
                  <th className="receipt-align-center">{t('receipt.qty_title', 'Số lượng')}</th>
                  <th className="receipt-align-right">{t('receipt.unit_price', 'Đơn giá')}</th>
                  <th className="receipt-align-right">{t('receipt.line_total', 'Thành tiền')}</th>
                </tr>
              </thead>
              <tbody>
                {(receipt.items || []).map((it, idx) => (
                  <tr key={idx}>
                    <td><strong>{it.name || it.item_name}</strong></td>
                    <td className="receipt-align-center">{it.quantity}</td>
                    <td className="receipt-align-right">{money(it.unit_price || it.price)}</td>
                    <td className="receipt-align-right">{money(it.total_price || it.total_gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="receipt-totals-box">
            {receipt.discount > 0 && (
              <div className="receipt-total-line note good">
                <span>Giảm giá ưu đãi:</span>
                <strong>−{money(receipt.discount)}</strong>
              </div>
            )}
            <div className="receipt-total-line grand-total">
              <span>Tổng tiền thanh toán:</span>
              <span>{money(receipt.total)}</span>
            </div>
          </div>
        </div>

        {/* Issued Tickets Section */}
        <div className="tickets-issued-section">
          <h2 className="section-title">Vé điện tử</h2>
          <div className="tickets-grid">
            {(receipt.attendees || []).map((att, idx) => (
              <div key={att.id || idx} className="e-ticket-card">
                <div className="ticket-top-band">
                  <span className="ticket-brand">TICKETFLOW PASS</span>
                  <span className="ticket-tier-badge">{att.seat ? `Ghế: ${att.seat}` : 'Vé tham dự'}</span>
                </div>
                <div className="ticket-main-body">
                  <div className="ticket-info-col">
                    <div className="ticket-field">
                      <span className="field-label">NGƯỜI THAM DỰ</span>
                      <span className="field-value">{att.name || receipt.buyer?.name}</span>
                    </div>
                    {att.seat && (
                      <div className="ticket-field">
                        <span className="field-label">CHỖ NGỒI</span>
                        <span className="field-value text-primary font-bold">{att.seat}</span>
                      </div>
                    )}
                    <div className="ticket-field">
                      <span className="field-label">MÃ VÉ</span>
                      <span className="field-value seat-highlight">{att.ticket_code || att.barcode}</span>
                    </div>
                  </div>
                  <div className="ticket-qr-col">
                    <QrCodeSvg value={att.qr_hash || att.ticket_code || att.barcode} size={110} />
                    <div className="qr-caption">Quét QR tại cổng</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="receipt-action-bar">
          <Link to="/my-tickets" className="btn btn-primary">
            🎟️ {t('receipt.manage_tickets', 'Quản lý trong Vé của tôi')}
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            🖨️ {t('action.print', 'In biên lai / Lưu PDF')}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ReceiptPage;
