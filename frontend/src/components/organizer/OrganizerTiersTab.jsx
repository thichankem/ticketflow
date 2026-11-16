import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { money } from '../../utils/display';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';

export const OrganizerTiersTab = ({ selectedEventId, events = [], onSelectEvent, notify }) => {
  const { t } = useLanguage();
  const [tiers, setTiers] = useState([]);
  const [loadingTiers, setLoadingTiers] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [tierEditId, setTierEditId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    price: 150000,
    total_quantity: 100,
    type: 'PAID',
    is_hidden: false,
  });

  const loadTiers = async (eventId) => {
    if (!eventId) return;
    setLoadingTiers(true);
    try {
      const res = await api.events.getTiers(eventId);
      const list = Array.isArray(res) ? res : res?.tiers || [];
      setTiers(list);
    } catch (err) {
      console.warn('Could not load tiers:', err.message);
      setTiers([]);
    } finally {
      setLoadingTiers(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadTiers(selectedEventId);
    }
  }, [selectedEventId]);

  const handleOpenCreate = () => {
    setTierEditId(null);
    setFormData({
      name: '',
      price: 150000,
      total_quantity: 100,
      type: 'PAID',
      is_hidden: false,
    });
    setShowModal(true);
  };

  const handleEditTier = (tier) => {
    setTierEditId(tier.id);
    setFormData({
      name: tier.name || tier.title || '',
      price: tier.price || 0,
      total_quantity: tier.total_quantity || tier.initial_quantity || 100,
      type: tier.type || (tier.price === 0 ? 'FREE' : 'PAID'),
      is_hidden: Boolean(tier.is_hidden),
    });
    setShowModal(true);
  };

  const handleSaveTier = async (e) => {
    e.preventDefault();
    if (!selectedEventId) return;
    try {
      const payload = {
        name: formData.name,
        title: formData.name,
        price: formData.type === 'FREE' ? 0 : parseInt(formData.price, 10),
        total_quantity: parseInt(formData.total_quantity, 10),
        quantity: parseInt(formData.total_quantity, 10),
        type: formData.type,
        is_hidden: Boolean(formData.is_hidden),
      };

      if (tierEditId) {
        const res = await api.events.updateTier(selectedEventId, tierEditId, payload);
        notify(`Hạng vé "${formData.name}" đã được cập nhật!`);
        setTiers((prev) =>
          prev.map((t) => (t.id === tierEditId ? { ...t, ...payload, ...(res?.tier || {}) } : t))
        );
      } else {
        const res = await api.events.createTier(selectedEventId, payload);
        const created = res?.tier || { id: Date.now(), ...payload };
        notify(`Đã tạo hạng vé "${created.name || created.title}"!`);
        setTiers((prev) => [...prev, created]);
      }

      setShowModal(false);
    } catch (err) {
      notify(`Lỗi lưu hạng vé: ${err.message}`, 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !selectedEventId) return;
    try {
      await api.events.deleteTier(selectedEventId, deleteTarget.id);
      notify(`Đã xóa hạng vé "${deleteTarget.name}"!`);
      setTiers((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      notify(`Không thể xóa hạng vé: ${err.message}`, 'error');
    }
  };

  return (
    <div className="stack">
      {/* Event Selector Toolbar */}
      {events.length > 0 && (
        <div className="card toolbar flex items-center justify-between">
          <div className="flex items-center gap-sm flex-1">
            <label htmlFor="tierEvSelect" className="font-bold whitespace-nowrap">
              Chọn sự kiện:
            </label>
            <select
              id="tierEvSelect"
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
            + Thêm Hạng Vé Mới
          </button>
        </div>
      )}

      {/* Tiers List */}
      <section className="card">
        <div className="flex justify-between items-center mb-md">
          <div>
            <h2 className="panel-title mb-0">{t('organizer.tab_tiers', 'Cấu Hình Hạng Vé')}</h2>
            <p className="muted text-xs m-0">Quản lý các loại vé, mức giá và số lượng mở bán cho sự kiện</p>
          </div>
        </div>

        {loadingTiers ? (
          <div className="loading-state p-lg text-center text-muted">Đang tải danh sách hạng vé...</div>
        ) : tiers.length === 0 ? (
          <div className="empty-state p-xl text-center">
            <p className="muted mb-sm">{t('organizer.no_tiers', 'Chưa có hạng vé nào được cấu hình cho sự kiện này.')}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleOpenCreate}>
              + Tạo Hạng Vé Đầu Tiên
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tên hạng vé</th>
                  <th>Phân loại</th>
                  <th>Giá vé</th>
                  <th>Số lượng</th>
                  <th>Hiển thị</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => {
                  const tierPrice = t.price || 0;
                  const capacity = t.total_quantity || t.initial_quantity || 0;
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name || t.title}</strong>
                      </td>
                      <td>
                        <span className="badge badge-info">{t.type || (tierPrice === 0 ? 'FREE' : 'PAID')}</span>
                      </td>
                      <td>
                        <strong>{money(tierPrice)}</strong>
                      </td>
                      <td>{capacity} vé</td>
                      <td>
                        <span className={`badge ${t.is_hidden ? 'badge-warning' : 'badge-success'}`}>
                          {t.is_hidden ? 'Ẩn' : 'Công khai'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions justify-end">
                          <button
                            type="button"
                            className="btn btn-xs btn-secondary"
                            onClick={() => handleEditTier(t)}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-danger"
                            onClick={() => setDeleteTarget(t)}
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

      {/* Tier Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={tierEditId ? 'Chỉnh Sửa Hạng Vé' : 'Thêm Hạng Vé Mới'}
      >
        <form onSubmit={handleSaveTier} className="stack">
          <div className="form-group">
            <label className="form-label required">Tên hạng vé</label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="VD: VIP Admission, Vé Tiêu Chuẩn"
              required
            />
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group">
              <label className="form-label">Phân loại vé</label>
              <select
                className="select"
                value={formData.type}
                onChange={(e) => {
                  const newType = e.target.value;
                  setFormData((p) => ({
                    ...p,
                    type: newType,
                    price: newType === 'FREE' ? 0 : p.price || 150000,
                  }));
                }}
              >
                <option value="PAID">Vé Trả Phí</option>
                <option value="FREE">Miễn Phí (0đ)</option>
                <option value="DONATION">Ủng Hộ / Quyên Góp</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label required">Giá vé (VNĐ)</label>
              <input
                type="number"
                className="input"
                value={formData.price}
                onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                min="0"
                step="1000"
                disabled={formData.type === 'FREE'}
                required
              />
            </div>
          </div>

          <div className="grid grid-2 gap-sm">
            <div className="form-group">
              <label className="form-label required">Số lượng phát hành</label>
              <input
                type="number"
                className="input"
                value={formData.total_quantity}
                onChange={(e) => setFormData((p) => ({ ...p, total_quantity: e.target.value }))}
                min="1"
                required
              />
            </div>

            <div className="form-group flex items-center gap-xs" style={{ paddingTop: '1.75rem' }}>
              <label className="flex items-center gap-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_hidden}
                  onChange={(e) => setFormData((p) => ({ ...p, is_hidden: e.target.checked }))}
                />
                <span className="font-semibold text-sm">Ẩn khỏi trang mua công khai</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
              Hủy
            </button>
            <button type="submit" className="btn btn-primary">
              {tierEditId ? 'Cập Nhật Hạng Vé' : 'Tạo Hạng Vé'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa hạng vé"
        message={`Bạn có chắc chắn muốn xóa hạng vé "${deleteTarget?.name}"? Thao tác này sẽ bị chặn nếu hạng vé đã có người đặt mua.`}
        isDanger={true}
      />
    </div>
  );
};

export default OrganizerTiersTab;
