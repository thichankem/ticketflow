import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { formatDate } from '../../utils/display';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';

export const OrganizerPromosTab = ({ selectedEventId, events = [], onSelectEvent, notify }) => {
  const { t } = useLanguage();
  const [promos, setPromos] = useState([]);
  const [loadingPromos, setLoadingPromos] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [promoEditId, setPromoEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [formData, setFormData] = useState({
    code: '',
    discount_type: 'PERCENTAGE',
    discount: '20',
    max_uses: '100',
    expires_at: '',
  });

  const loadPromos = async (eventId) => {
    if (!eventId) return;
    setLoadingPromos(true);
    try {
      const res = await api.events.getPromos(eventId);
      const list = Array.isArray(res) ? res : res?.promos || [];
      setPromos(list);
    } catch (err) {
      console.warn('Could not load promos:', err.message);
      setPromos([]);
    } finally {
      setLoadingPromos(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadPromos(selectedEventId);
    }
  }, [selectedEventId]);

  const handleOpenCreate = () => {
    setPromoEditId(null);
    setFormData({
      code: '',
      discount_type: 'PERCENTAGE',
      discount: '20',
      max_uses: '100',
      expires_at: '',
    });
    setShowModal(true);
  };

  const handleEditPromo = (promo) => {
    setPromoEditId(promo.id);
    setFormData({
      code: promo.code || '',
      discount_type: promo.discount_type || 'PERCENTAGE',
      discount: String(promo.discount ?? promo.discount_amount ?? 20),
      max_uses: promo.max_uses ? String(promo.max_uses) : '100',
      expires_at: promo.expires_at || promo.expiry ? (typeof (promo.expires_at || promo.expiry) === 'string' ? (promo.expires_at || promo.expiry).split('T')[0] : '') : '',
    });
    setShowModal(true);
  };

  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    try {
      const payload = {
        code: formData.code.toUpperCase().trim(),
        discount_type: formData.discount_type,
        discount: parseFloat(formData.discount),
        discount_amount: parseFloat(formData.discount),
        max_uses: parseInt(formData.max_uses, 10),
        expires_at: formData.expires_at ? new Date(formData.expires_at).toISOString() : null,
      };

      if (promoEditId) {
        const res = await api.events.updatePromo(selectedEventId, promoEditId, payload);
        notify(`Mã giảm giá "${payload.code}" đã được cập nhật!`);
        setPromos((prev) =>
          prev.map((p) => (p.id === promoEditId ? { ...p, ...payload, ...(res?.promo || {}) } : p))
        );
      } else {
        const res = await api.events.createPromo(selectedEventId, payload);
        const created = res?.promo || { id: Date.now(), ...payload };
        notify(`Đã tạo mã giảm giá "${created.code}"!`);
        setPromos((prev) => [...prev, created]);
      }

      setShowModal(false);
    } catch (err) {
      notify(`Lỗi lưu mã giảm giá: ${err.message}`, 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !selectedEventId) return;
    try {
      await api.events.deletePromo(selectedEventId, deleteTarget.id);
      notify(`Đã xóa mã giảm giá "${deleteTarget.code}"!`);
      setPromos((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      notify(`Không thể xóa mã: ${err.message}`, 'error');
    }
  };

  return (
    <div className="stack">
      {/* Event Selector Toolbar */}
      {events.length > 0 && (
        <div className="card toolbar flex items-center justify-between">
          <div className="flex items-center gap-sm flex-1">
            <label htmlFor="promoEvSelect" className="font-bold whitespace-nowrap">
              Chọn sự kiện:
            </label>
            <select
              id="promoEvSelect"
              className="select max-w-400"
              value={selectedEventId || ''}
              onChange={(e) => onSelectEvent(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  #{ev.id} - {ev.title} ({ev.status})
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
            + Thêm Mã Giảm Giá
          </button>
        </div>
      )}

      {/* Promos List */}
      <section className="card">
        <div className="flex justify-between items-center mb-md">
          <div>
            <h2 className="panel-title mb-0">{t('organizer.tab_promos', 'Mã Giảm Giá & Voucher')}</h2>
            <p className="muted text-xs m-0">Thiết lập các chiến dịch chiết khấu phần trăm hoặc số tiền cố định</p>
          </div>
        </div>

        {loadingPromos ? (
          <div className="loading-state p-lg text-center text-muted">Đang tải danh sách mã giảm giá...</div>
        ) : promos.length === 0 ? (
          <div className="empty-state p-xl text-center">
            <p className="muted mb-sm">{t('organizer.no_promos', 'Chưa có mã giảm giá nào cho sự kiện này.')}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
              + Tạo Mã Đầu Tiên
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã Voucher</th>
                  <th>Loại chiết khấu</th>
                  <th>Mức giảm</th>
                  <th>Lượt sử dụng</th>
                  <th>Hạn dùng</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {promos.map((p) => {
                  const used = p.used_count || 0;
                  const max = p.max_uses || '∞';
                  return (
                    <tr key={p.id}>
                      <td>
                        <strong className="badge badge-primary">{p.code}</strong>
                      </td>
                      <td>
                        <span className="badge badge-secondary">
                          {p.discount_type === 'FIXED' ? 'Số tiền cố định' : 'Phần trăm (%)'}
                        </span>
                      </td>
                      <td>
                        <strong>
                          {p.discount_type === 'FIXED'
                            ? `${Number(p.discount || p.discount_amount || 0).toLocaleString()} VNĐ`
                            : `${p.discount || p.discount_amount || 0}%`}
                        </strong>
                      </td>
                      <td>
                        {used} / {max}
                      </td>
                      <td className="text-sm muted">
                        {p.expires_at || p.expiry ? formatDate(p.expires_at || p.expiry) : 'Không giới hạn'}
                      </td>
                      <td>
                        <div className="table-actions justify-end">
                          <button
                            type="button"
                            className="btn btn-xs btn-secondary"
                            onClick={() => handleEditPromo(p)}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-danger"
                            onClick={() => setDeleteTarget(p)}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Promo Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={promoEditId ? 'Chỉnh Sửa Mã Giảm Giá' : 'Tạo Mã Giảm Giá Mới'}
      >
        <form onSubmit={handleSavePromo} className="stack">
          <div className="form-group">
            <label className="form-label required">Mã Voucher</label>
            <input
              type="text"
              className="input uppercase"
              value={formData.code}
              onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              placeholder="VD: TECHSALE20, EARLYBIRD"
              required
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group">
              <label className="form-label">Loại chiết khấu</label>
              <select
                className="select"
                value={formData.discount_type}
                onChange={(e) => setFormData((p) => ({ ...p, discount_type: e.target.value }))}
              >
                <option value="PERCENTAGE">Theo phần trăm (%)</option>
                <option value="FIXED">Số tiền cố định (VNĐ)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label required">
                {formData.discount_type === 'PERCENTAGE' ? 'Mức giảm (%)' : 'Số tiền giảm (VNĐ)'}
              </label>
              <input
                type="number"
                className="input"
                value={formData.discount}
                onChange={(e) => setFormData((p) => ({ ...p, discount: e.target.value }))}
                min="1"
                max={formData.discount_type === 'PERCENTAGE' ? 100 : undefined}
                required
              />
            </div>
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group">
              <label className="form-label required">Số lượt dùng tối đa</label>
              <input
                type="number"
                className="input"
                value={formData.max_uses}
                onChange={(e) => setFormData((p) => ({ ...p, max_uses: e.target.value }))}
                min="1"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Ngày hết hạn (tùy chọn)</label>
              <input
                type="date"
                className="input"
                value={formData.expires_at}
                onChange={(e) => setFormData((p) => ({ ...p, expires_at: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              {promoEditId ? 'Cập Nhật Mã' : 'Tạo Mã Giảm Giá'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa mã giảm giá"
        message={`Bạn có chắc chắn muốn xóa mã voucher "${deleteTarget?.code}" không?`}
        isDanger={true}
      />
    </div>
  );
};

export default OrganizerPromosTab;
