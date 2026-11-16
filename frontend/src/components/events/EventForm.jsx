import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ImageUploader } from '../ImageUploader';
import { StatusBadge } from '../common/StatusBadge';

export const EventForm = ({
  initialData = null,
  eventId = null,
  onSave,
  onCancel,
  includeTiers = false,
}) => {
  const [formData, setFormData] = useState({
    title: '',
    category: 'Tech',
    status: 'LIVE',
    location: '',
    province: 'Hồ Chí Minh',
    is_online: false,
    online_url: '',
    start_date: '',
    end_date: '',
    description: '',
    banner: '',
    cover: '',
    allow_refunds: true,
    refund_max_days: 7,
    refund_min_days_before_event: 3,
    refund_policy_type: 'STANDARD',
    blocks: [],
    pdf_attachments: [],
  });

  const [ticketTiers, setTicketTiers] = useState([
    { id: 't1', name: 'Standard Ticket', type: 'PAID', price: 150000, total_quantity: 100, min_per_order: 1, max_per_order: 5 },
  ]);

  const [provinces, setProvinces] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errorNotice, setErrorNotice] = useState(null);

  useEffect(() => {
    // Load provinces for location select
    api.location
      .getProvinces()
      .then((res) => {
        if (Array.isArray(res)) setProvinces(res);
        else if (res?.provinces) setProvinces(res.provinces);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialData) {
      setFormData({
        title: initialData.title || '',
        category: initialData.category || 'Tech',
        status: initialData.status || 'LIVE',
        location: initialData.location || '',
        province: initialData.province || 'Hồ Chí Minh',
        is_online: Boolean(initialData.is_online),
        online_url: initialData.online_url || '',
        start_date: initialData.start_date || initialData.starts_at ? new Date(initialData.start_date || initialData.starts_at).toISOString().slice(0, 16) : '',
        end_date: initialData.end_date || initialData.ends_at ? new Date(initialData.end_date || initialData.ends_at).toISOString().slice(0, 16) : '',
        description: initialData.description || '',
        banner: initialData.banner || initialData.banner_url || initialData.cover || '',
        cover: initialData.cover || initialData.image_url || '',
        allow_refunds: initialData.allow_refunds !== undefined ? initialData.allow_refunds : true,
        refund_max_days: initialData.refund_max_days || 7,
        refund_min_days_before_event: initialData.refund_min_days_before_event || 3,
        refund_policy_type: initialData.refund_policy_type || 'STANDARD',
        blocks: initialData.blocks || initialData.blog_content || [],
        pdf_attachments: initialData.pdf_attachments || [],
      });
    }
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddTier = () => {
    setTicketTiers((prev) => [
      ...prev,
      {
        id: `t_${Date.now()}`,
        name: '',
        type: 'PAID',
        price: 200000,
        total_quantity: 50,
        min_per_order: 1,
        max_per_order: 5,
      },
    ]);
  };

  const handleUpdateTier = (id, field, value) => {
    setTicketTiers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, [field]: value };
        if (field === 'type' && value === 'FREE') updated.price = 0;
        return updated;
      })
    );
  };

  const handleRemoveTier = (id) => {
    if (ticketTiers.length <= 1) return;
    setTicketTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const addBlock = (type) => {
    setFormData((prev) => ({
      ...prev,
      blocks: [
        ...prev.blocks,
        {
          id: Date.now(),
          type,
          title: type === 'text' ? 'Đoạn văn bản' : type === 'media' ? 'Hình ảnh' : 'Lịch trình',
          content: '',
          url: '',
          caption: '',
        },
      ],
    }));
  };

  const removeBlock = (id) => {
    setFormData((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== id),
    }));
  };

  const updateBlock = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setErrorNotice('Vui lòng nhập tên sự kiện.');
      return;
    }

    setSaving(true);
    setErrorNotice(null);

    try {
      const payload = {
        ...formData,
        ...(includeTiers
          ? {
              ticket_tiers: ticketTiers.map((t) => ({
                name: t.name.trim(),
                type: t.type,
                price: t.type === 'FREE' ? 0 : Number(t.price || 0),
                total_quantity: Number(t.total_quantity || 100),
                min_per_order: Number(t.min_per_order || 1),
                max_per_order: Number(t.max_per_order || 10),
              })),
            }
          : {}),
      };

      if (onSave) {
        await onSave(payload, eventId);
      }
    } catch (err) {
      setErrorNotice(err.message || 'Lỗi lưu thông tin sự kiện.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="event-form-container">
      {errorNotice && (
        <div className="alert alert-danger mb-md">
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Basic Information */}
      <div className="card mb-lg p-lg">
        <h3 className="card-title text-lg font-bold mb-md">1. Thông tin cơ bản</h3>
        <div className="grid grid-2 gap-md">
          <div className="form-group">
            <label className="form-label required">Tên sự kiện</label>
            <input
              type="text"
              name="title"
              className="input"
              value={formData.title}
              onChange={handleChange}
              placeholder="VD: Tech Conference Vietnam 2026"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Thể loại sự kiện</label>
            <select name="category" className="select" value={formData.category} onChange={handleChange}>
              <option value="Tech">Công nghệ & Kỹ thuật (Tech)</option>
              <option value="Music">Âm nhạc & Lễ hội (Music)</option>
              <option value="Business">Kinh doanh & Khởi nghiệp (Business)</option>
              <option value="Art">Nghệ thuật & Thiết kế (Art)</option>
              <option value="Sports">Thể thao & Sức khỏe (Sports)</option>
              <option value="Workshop">Workshop & Đào tạo</option>
              <option value="Other">Khác</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Trạng thái phát hành</label>
            <select name="status" className="select" value={formData.status} onChange={handleChange}>
              <option value="LIVE">Mở bán công khai (LIVE)</option>
              <option value="DRAFT">Lưu bản nháp (DRAFT)</option>
              <option value="PAUSED">Tạm ngưng nhận đăng ký (PAUSED)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tỉnh / Thành phố tổ chức</label>
            <select name="province" className="select" value={formData.province} onChange={handleChange}>
              {provinces.length > 0 ? (
                provinces.map((p) => (
                  <option key={p.name || p} value={p.name || p}>
                    {p.name || p}
                  </option>
                ))
              ) : (
                <>
                  <option value="Hồ Chí Minh">TP. Hồ Chí Minh</option>
                  <option value="Hà Nội">TP. Hà Nội</option>
                  <option value="Đà Nẵng">TP. Đà Nẵng</option>
                  <option value="Cần Thơ">TP. Cần Thơ</option>
                </>
              )}
            </select>
          </div>

          <div className="form-group col-span-2">
            <label className="form-label">Địa điểm cụ thể</label>
            <input
              type="text"
              name="location"
              className="input"
              value={formData.location}
              onChange={handleChange}
              placeholder="VD: Trung tâm Hội nghị SECC, 799 Nguyễn Văn Linh, Q.7, TP.HCM"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Thời gian bắt đầu</label>
            <input
              type="datetime-local"
              name="start_date"
              className="input"
              value={formData.start_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Thời gian kết thúc</label>
            <input
              type="datetime-local"
              name="end_date"
              className="input"
              value={formData.end_date}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="form-group mt-md">
          <label className="form-label">Mô tả tóm tắt sự kiện</label>
          <textarea
            name="description"
            className="input textarea"
            rows="3"
            value={formData.description}
            onChange={handleChange}
            placeholder="Mô tả ngắn gọn về quy mô, đối tượng tham gia và điểm nổi bật..."
          />
        </div>
      </div>

      {/* Media Uploads */}
      <div className="card mb-lg p-lg">
        <h3 className="card-title text-lg font-bold mb-md">2. Hình ảnh & Banner quảng bá</h3>
        <div className="grid grid-2 gap-lg">
          <div>
            <label className="form-label font-semibold mb-xs">Ảnh bìa (Cover Image - 1:1 hoặc 4:3)</label>
            <ImageUploader
              initialUrl={formData.cover}
              eventId={eventId}
              targetType="cover"
              onUploadComplete={(url) => setFormData((prev) => ({ ...prev, cover: url }))}
            />
          </div>
          <div>
            <label className="form-label font-semibold mb-xs">Ảnh biểu ngữ (Banner Image - 16:9)</label>
            <ImageUploader
              initialUrl={formData.banner}
              eventId={eventId}
              targetType="banner"
              onUploadComplete={(url) => setFormData((prev) => ({ ...prev, banner: url }))}
            />
          </div>
        </div>
      </div>

      {/* Refund Policy Settings */}
      <div className="card mb-lg p-lg">
        <h3 className="card-title text-lg font-bold mb-md">3. Chính sách hoàn tiền vé</h3>
        <div className="grid grid-3 gap-md">
          <div className="form-group flex items-center gap-xs" style={{ paddingTop: '1.75rem' }}>
            <label className="flex items-center gap-xs cursor-pointer">
              <input
                type="checkbox"
                name="allow_refunds"
                checked={formData.allow_refunds}
                onChange={handleChange}
              />
              <span className="font-semibold">Cho phép người mua hủy vé</span>
            </label>
          </div>

          <div className="form-group">
            <label className="form-label">Số ngày tối đa sau khi mua</label>
            <input
              type="number"
              name="refund_max_days"
              className="input"
              value={formData.refund_max_days}
              onChange={handleChange}
              min="1"
              max="60"
              disabled={!formData.allow_refunds}
            />
            <span className="text-xs text-muted">Ví dụ: Được hủy vé trong 7 ngày đầu</span>
          </div>

          <div className="form-group">
            <label className="form-label">Số ngày tối thiểu trước sự kiện</label>
            <input
              type="number"
              name="refund_min_days_before_event"
              className="input"
              value={formData.refund_min_days_before_event}
              onChange={handleChange}
              min="0"
              max="30"
              disabled={!formData.allow_refunds}
            />
            <span className="text-xs text-muted">Ví dụ: Phải hủy trước giờ G ít nhất 3 ngày</span>
          </div>
        </div>
      </div>

      {/* Optional Initial Ticket Tiers */}
      {includeTiers && (
        <div className="card mb-lg p-lg">
          <div className="flex justify-between items-center mb-md">
            <div>
              <h3 className="card-title text-lg font-bold m-0">4. Thiết lập Hạng vé ban đầu</h3>
              <p className="text-muted text-xs m-0">Người mua chọn hạng vé khi mua, xếp chỗ tự do (Open Seating).</p>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddTier}>
              + Thêm hạng vé
            </button>
          </div>

          <div className="space-y-sm">
            {ticketTiers.map((t, idx) => (
              <div key={t.id} className="card p-md border flex flex-wrap items-center gap-md">
                <span className="font-bold text-muted">#{idx + 1}</span>
                <input
                  type="text"
                  className="input flex-1"
                  style={{ minWidth: '160px' }}
                  placeholder="Tên hạng vé (VD: VIP, Standard)"
                  value={t.name}
                  onChange={(e) => handleUpdateTier(t.id, 'name', e.target.value)}
                  required
                />
                <select
                  className="select"
                  style={{ width: '130px' }}
                  value={t.type}
                  onChange={(e) => handleUpdateTier(t.id, 'type', e.target.value)}
                >
                  <option value="PAID">Vé trả phí</option>
                  <option value="FREE">Miễn phí</option>
                  <option value="DONATION">Ủng hộ</option>
                </select>
                {t.type !== 'FREE' && (
                  <input
                    type="number"
                    className="input"
                    style={{ width: '130px' }}
                    placeholder="Giá vé (VNĐ)"
                    value={t.price}
                    onChange={(e) => handleUpdateTier(t.id, 'price', e.target.value)}
                    min="0"
                    step="1000"
                  />
                )}
                <input
                  type="number"
                  className="input"
                  style={{ width: '110px' }}
                  placeholder="Số lượng"
                  value={t.total_quantity}
                  onChange={(e) => handleUpdateTier(t.id, 'total_quantity', e.target.value)}
                  min="1"
                />
                {ticketTiers.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => handleRemoveTier(t.id)}
                  >
                    Xóa
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-md">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            Hủy thao tác
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Đang lưu sự kiện...' : eventId ? 'Cập nhật sự kiện' : 'Xuất bản sự kiện'}
        </button>
      </div>
    </form>
  );
};

export default EventForm;
