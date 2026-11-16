import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { ImageUploader } from '../components/ImageUploader';

export const CreateEventPage = () => {
  const { user, isOrganizer, isAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [errorNotice, setErrorNotice] = useState(null);

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
    refund_percentage: 100,
    queue_enabled: false,
    queue_max_concurrent: 100,
    tags: 'TECH, CONFERENCE',
    blocks: [],
  });

  // Load provinces for Vietnam geolocation
  useEffect(() => {
    const loadProvinces = async () => {
      try {
        const list = await api.location.getProvinces();
        if (Array.isArray(list) && list.length > 0) {
          setProvinces(list);
        } else {
          setProvinces(['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng', 'Nha Trang']);
        }
      } catch {
        setProvinces(['Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng', 'Cần Thơ', 'Hải Phòng', 'Nha Trang']);
      }
    };
    loadProvinces();
  }, []);

  // Blog block handlers
  const addBlock = (type) => {
    const newBlock = {
      id: Date.now(),
      type,
      title: type === 'agenda' ? 'Lịch trình chi tiết' : '',
      content: '',
      media_url: '',
      time: type === 'agenda' ? '08:30 - 09:30' : '',
    };
    setFormData((prev) => ({
      ...prev,
      blocks: [...(prev.blocks || []), newBlock],
    }));
  };

  const updateBlock = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b)),
    }));
  };

  const removeBlock = (id) => {
    setFormData((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== id),
    }));
  };

  // Ticket tiers state & handlers
  const [ticketTiers, setTicketTiers] = useState([
    {
      id: 1,
      name: 'Vé Tiêu Chuẩn (Standard)',
      type: 'PAID', // 'PAID' | 'FREE' | 'DONATION'
      price: 150000,
      total_quantity: 100,
      min_per_order: 1,
      max_per_order: 10,
      description: 'Vé vào cổng tiêu chuẩn tham dự sự kiện',
    },
  ]);

  const addTier = (preset = null) => {
    const nextId = Date.now();
    let newTier = {
      id: nextId,
      name: `Hạng vé #${ticketTiers.length + 1}`,
      type: 'PAID',
      price: 200000,
      total_quantity: 100,
      min_per_order: 1,
      max_per_order: 10,
      description: '',
    };

    if (preset === 'vip') {
      newTier = {
        ...newTier,
        name: 'Vé VIP (VIP Gold Pass)',
        type: 'PAID',
        price: 500000,
        total_quantity: 50,
        description: 'Vị trí ngồi hàng đầu, quà lưu niệm & ưu tiên lối đi VIP',
      };
    } else if (preset === 'free') {
      newTier = {
        ...newTier,
        name: 'Vé Miễn Phí (Free Pass)',
        type: 'FREE',
        price: 0,
        total_quantity: 200,
        description: 'Vé mời tham dự miễn phí cho cộng đồng',
      };
    } else if (preset === 'early') {
      newTier = {
        ...newTier,
        name: 'Vé Mở Bán Sớm (Early Bird)',
        type: 'PAID',
        price: 99000,
        total_quantity: 50,
        description: 'Ưu đãi đặc biệt dành cho người đăng ký sớm',
      };
    }

    setTicketTiers((prev) => [...prev, newTier]);
  };

  const updateTier = (id, field, value) => {
    setTicketTiers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const updated = { ...t, [field]: value };
        if (field === 'type' && value === 'FREE') {
          updated.price = 0;
        }
        return updated;
      })
    );
  };

  const removeTier = (id) => {
    if (ticketTiers.length <= 1) return;
    setTicketTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setErrorNotice('Vui lòng nhập tên sự kiện');
      return;
    }

    // Validate ticket tiers
    if (ticketTiers.length === 0) {
      setErrorNotice('Vui lòng thêm ít nhất một loại vé cho sự kiện');
      return;
    }

    for (let i = 0; i < ticketTiers.length; i++) {
      const tier = ticketTiers[i];
      if (!tier.name.trim()) {
        setErrorNotice(`Vui lòng nhập tên cho hạng vé #${i + 1}`);
        return;
      }
      if (tier.type === 'PAID' && (isNaN(tier.price) || Number(tier.price) < 0)) {
        setErrorNotice(`Giá vé của hạng vé "${tier.name}" không hợp lệ`);
        return;
      }
      if (isNaN(tier.total_quantity) || Number(tier.total_quantity) <= 0) {
        setErrorNotice(`Số lượng vé của hạng vé "${tier.name}" phải lớn hơn 0`);
        return;
      }
    }

    setSaving(true);
    setErrorNotice(null);
    try {
      const payload = {
        ...formData,
        ticket_tiers: ticketTiers.map((t) => ({
          name: t.name.trim(),
          type: t.type,
          tier_type: t.type,
          price: t.type === 'FREE' ? 0 : Number(t.price || 0),
          total_quantity: Number(t.total_quantity || 100),
          min_per_order: Number(t.min_per_order || 1),
          max_per_order: Number(t.max_per_order || 10),
          description: t.description || '',
        })),
      };

      const res = await api.events.create(payload);
      const createdEvent = res?.event || res;
      const eventId = createdEvent.id;

      // Ensure each tier is created in database
      try {
        const existingTiers = await api.events.getTiers(eventId);
        const existingList = Array.isArray(existingTiers) ? existingTiers : existingTiers?.tiers || [];
        if (existingList.length === 0) {
          for (const tier of ticketTiers) {
            await api.events.createTier(eventId, {
              name: tier.name.trim(),
              type: tier.type,
              price: tier.type === 'FREE' ? 0 : Number(tier.price || 0),
              total_quantity: Number(tier.total_quantity || 100),
              min_per_order: Number(tier.min_per_order || 1),
              max_per_order: Number(tier.max_per_order || 10),
              description: tier.description || '',
            });
          }
        }
      } catch (tierErr) {
        console.warn('Fallback creating tiers:', tierErr.message);
      }

      navigate('/organizer', {
        state: {
          notice: `Sự kiện "${createdEvent.title || formData.title}" cùng ${ticketTiers.length} loại vé đã được tạo thành công!`,
          selectedEventId: createdEvent.id,
        },
      });
    } catch (err) {
      setErrorNotice(err.message || 'Lỗi khi tạo sự kiện. Vui lòng thử lại.');
      setSaving(false);
    }
  };

  return (
    <div className="container py-lg max-w-4xl mx-auto">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex justify-between items-center mb-md">
        <Link to="/organizer" className="btn btn-secondary btn-sm flex items-center gap-xs">
          ← {t('common.back', 'Quay lại Studio')}
        </Link>
        <span className="badge badge-primary font-semibold">Trang Tạo Sự Kiện Độc Lập</span>
      </div>

      <div className="card shadow-lg p-lg border-primary">
        <div className="border-b pb-md mb-lg">
          <h1 className="text-2xl font-bold m-0 flex items-center gap-xs">
            <span>✨</span> Tạo Sự Kiện Mới (New Event Wizard)
          </h1>
          <p className="muted text-sm mt-xs m-0">
            Điền đầy đủ thông tin chi tiết để xuất bản sự kiện lên sàn phân phối vé Ticketflow.
          </p>
        </div>

        {errorNotice && (
          <div className="alert alert-danger mb-md p-sm rounded text-sm">
            ⚠️ {errorNotice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* PHẦN 1: THÔNG TIN CƠ BẢN */}
          <section className="form-section-box">
            <h3 className="text-base font-bold mb-sm text-slate-800 dark:text-slate-100 flex items-center gap-xs">
              <span>📌</span> 1. Thông Tin Chung
            </h3>
            <div className="form-group mb-sm">
              <label htmlFor="createEvTitle" className="font-semibold text-sm">
                Tên Sự Kiện *
              </label>
              <input
                id="createEvTitle"
                type="text"
                className="input"
                required
                placeholder="Ví dụ: Đại Nhạc Hội Mùa Hè 2026 hoặc Hội Thảo AI & Công Nghệ"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div className="form-group mb-0">
                <label htmlFor="createEvCategory" className="font-semibold text-sm">
                  Chủ Đề / Danh Mục *
                </label>
                <select
                  id="createEvCategory"
                  className="select"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="Tech">Công Nghệ & AI (Tech)</option>
                  <option value="Music">Âm Nhạc & Concert (Music)</option>
                  <option value="Sports">Thể Thao & Esport (Sports)</option>
                  <option value="Business">Kinh Doanh & Khởi Nghiệp (Business)</option>
                  <option value="Community">Cộng Đồng & Xã Hội (Community)</option>
                  <option value="Film">Điện Ảnh & Nghệ Thuật (Film)</option>
                </select>
              </div>

              <div className="form-group mb-0">
                <label htmlFor="createEvStatus" className="font-semibold text-sm">
                  Trạng Thái Xuất Bản *
                </label>
                <select
                  id="createEvStatus"
                  className="select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="LIVE">LIVE (Mở bán công khai ngay lập tức)</option>
                  <option value="DRAFT">DRAFT (Lưu nháp nội bộ chưa mở bán)</option>
                </select>
              </div>
            </div>
          </section>

          {/* PHẦN 2: THỜI GIAN & ĐỊA ĐIỂM */}
          <section className="form-section-box">
            <h3 className="text-base font-bold mb-sm text-slate-800 dark:text-slate-100 flex items-center gap-xs">
              <span>📍</span> 2. Thời Gian & Địa Điểm Tổ Chức
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-sm">
              <div className="form-group mb-0">
                <label htmlFor="createEvStart" className="font-semibold text-sm">
                  Thời Gian Bắt Đầu *
                </label>
                <input
                  id="createEvStart"
                  type="datetime-local"
                  className="input"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>

              <div className="form-group mb-0">
                <label htmlFor="createEvEnd" className="font-semibold text-sm">
                  Thời Gian Kết Thúc
                </label>
                <input
                  id="createEvEnd"
                  type="datetime-local"
                  className="input"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md mb-sm">
              <div className="form-group mb-0">
                <label htmlFor="createEvProvince" className="font-semibold text-sm">
                  Tỉnh / Thành Phố *
                </label>
                <select
                  id="createEvProvince"
                  className="select"
                  value={formData.province}
                  onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                >
                  {provinces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-0">
                <label htmlFor="createEvLocation" className="font-semibold text-sm">
                  Địa Chỉ / Nhà Hát / Sân Vận Động
                </label>
                <input
                  id="createEvLocation"
                  type="text"
                  className="input"
                  placeholder="Ví dụ: Trung tâm Triển lãm SECC, Quận 7, TP.HCM"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-sm mt-xs">
              <label className="flex items-center gap-xs cursor-pointer text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={formData.is_online}
                  onChange={(e) => setFormData({ ...formData, is_online: e.target.checked })}
                />
                <span>🌐 Đây là sự kiện trực tuyến (Livestream / Online Webinar)</span>
              </label>
            </div>

            {formData.is_online && (
              <div className="form-group mt-sm">
                <label className="text-xs font-semibold">Đường link phát sóng (Zoom, Google Meet, YouTube Live):</label>
                <input
                  type="url"
                  className="input input-sm"
                  placeholder="https://meet.google.com/xyz hoặc https://zoom.us/j/..."
                  value={formData.online_url}
                  onChange={(e) => setFormData({ ...formData, online_url: e.target.value })}
                />
              </div>
            )}
          </section>

          {/* PHẦN 3: CẤU HÌNH LOẠI VÉ & GIÁ VÉ */}
          <section className="form-section-box">
            <div className="flex justify-between items-center mb-xs flex-wrap gap-xs">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-xs m-0">
                <span>🎟️</span> 3. Cấu Hình Loại Vé & Giá Mỗi Vé (Ticket Tiers & Pricing)
              </h3>
              <div className="flex items-center gap-xs flex-wrap">
                <span className="text-xs muted mr-01">Mẫu nhanh:</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => addTier('vip')}
                  title="Thêm nhanh hạng vé VIP"
                >
                  + Vé VIP
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => addTier('early')}
                  title="Thêm nhanh vé Early Bird"
                >
                  + Vé Early Bird
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => addTier('free')}
                  title="Thêm nhanh vé Miễn Phí"
                >
                  + Vé Miễn Phí
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-xs font-semibold"
                  onClick={() => addTier()}
                >
                  ➕ Thêm Hạng Vé
                </button>
              </div>
            </div>
            <p className="muted text-xs mb-md">
              Thiết lập tên hạng vé, phân loại (có phí, miễn phí), mức giá bán và số lượng vé phát hành cho sự kiện.
            </p>

            <div className="space-y-4">
              {ticketTiers.map((tier, idx) => (
                <div
                  key={tier.id}
                  className="card p-md border rounded-md shadow-sm transition-all"
                  style={{ background: 'var(--bg-card, #ffffff)' }}
                >
                  <div className="flex justify-between items-center pb-xs border-b mb-sm flex-wrap gap-xs">
                    <div className="flex items-center gap-xs">
                      <span className="badge badge-primary font-bold text-xs">
                        Hạng vé #{idx + 1}
                      </span>
                      <span className={`badge ${tier.type === 'FREE' ? 'badge-success' : tier.type === 'DONATION' ? 'badge-amber' : 'badge-info'} text-xs font-semibold`}>
                        {tier.type === 'FREE' ? '🟢 Miễn Phí (0đ)' : tier.type === 'DONATION' ? '🟡 Quyên Góp / Tùy Tâm' : '🔵 Có Thu Phí'}
                      </span>
                      <strong className="text-sm">{tier.name || `Hạng vé #${idx + 1}`}</strong>
                    </div>

                    {ticketTiers.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs text-danger font-semibold"
                        onClick={() => removeTier(tier.id)}
                        title="Xóa loại vé này"
                      >
                        ✕ Xóa loại vé
                      </button>
                    )}
                  </div>

                  {/* Grid 4 columns: Tên vé, Loại vé, Giá vé, Số lượng vé */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-sm mb-sm">
                    <div className="form-group mb-0 md:col-span-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Tên Loại Vé *
                      </label>
                      <input
                        type="text"
                        className="input input-sm font-semibold"
                        required
                        placeholder="VD: Vé Tiêu Chuẩn, Vé VIP..."
                        value={tier.name}
                        onChange={(e) => updateTier(tier.id, 'name', e.target.value)}
                      />
                    </div>

                    <div className="form-group mb-0 md:col-span-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Hình Thức Vé *
                      </label>
                      <select
                        className="select select-sm"
                        value={tier.type}
                        onChange={(e) => updateTier(tier.id, 'type', e.target.value)}
                      >
                        <option value="PAID">Vé có thu phí (PAID)</option>
                        <option value="FREE">Vé miễn phí (FREE - 0đ)</option>
                        <option value="DONATION">Vé tùy tâm (DONATION)</option>
                      </select>
                    </div>

                    <div className="form-group mb-0 md:col-span-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Giá Mỗi Vé (VNĐ) *
                      </label>
                      <input
                        type="number"
                        className="input input-sm font-mono font-bold"
                        min="0"
                        step="1000"
                        required
                        disabled={tier.type === 'FREE'}
                        placeholder={tier.type === 'FREE' ? '0' : '150000'}
                        value={tier.type === 'FREE' ? 0 : tier.price}
                        onChange={(e) => updateTier(tier.id, 'price', e.target.value)}
                      />
                      <span className="text-2xs text-good font-mono d-block mt-01">
                        {tier.type === 'FREE' ? '0 ₫ (Miễn phí vé)' : `${new Intl.NumberFormat('vi-VN').format(Number(tier.price || 0))} ₫`}
                      </span>
                    </div>

                    <div className="form-group mb-0 md:col-span-1">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Số Lượng Phát Hành *
                      </label>
                      <input
                        type="number"
                        className="input input-sm font-mono"
                        min="1"
                        required
                        placeholder="100"
                        value={tier.total_quantity}
                        onChange={(e) => updateTier(tier.id, 'total_quantity', e.target.value)}
                      />
                      <span className="text-2xs muted d-block mt-01">
                        Sức chứa / số chỗ mở bán
                      </span>
                    </div>
                  </div>

                  {/* Secondary row: Mô tả & giới hạn mua */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-sm">
                    <div className="form-group mb-0 md:col-span-2">
                      <label className="text-xs font-medium text-muted">
                        Mô Tả Quyền Lợi / Ghi Chú Hạng Vé:
                      </label>
                      <input
                        type="text"
                        className="input input-sm"
                        placeholder="VD: Bao gồm quà lưu niệm, chỗ ngồi khu A, cocktail đón khách..."
                        value={tier.description || ''}
                        onChange={(e) => updateTier(tier.id, 'description', e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-xs md:col-span-1">
                      <div className="form-group mb-0">
                        <label className="text-xs font-medium text-muted">Mua tối thiểu:</label>
                        <input
                          type="number"
                          className="input input-sm font-mono text-center"
                          min="1"
                          max={tier.max_per_order || 10}
                          value={tier.min_per_order || 1}
                          onChange={(e) => updateTier(tier.id, 'min_per_order', Number(e.target.value))}
                        />
                      </div>
                      <div className="form-group mb-0">
                        <label className="text-xs font-medium text-muted">Mua tối đa / đơn:</label>
                        <input
                          type="number"
                          className="input input-sm font-mono text-center"
                          min="1"
                          max="50"
                          value={tier.max_per_order || 10}
                          onChange={(e) => updateTier(tier.id, 'max_per_order', Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total summary footer */}
            <div className="flex justify-between items-center pt-sm mt-sm border-t text-xs font-semibold">
              <div className="flex items-center gap-md">
                <span>Tổng số hạng vé: <strong className="text-primary">{ticketTiers.length}</strong></span>
                <span>
                  Tổng vé mở bán: <strong className="text-good">{ticketTiers.reduce((s, t) => s + (Number(t.total_quantity) || 0), 0)} vé</strong>
                </span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => addTier()}
              >
                + Thêm Hạng Vé Mới
              </button>
            </div>
          </section>

          {/* PHẦN 4: HÌNH ẢNH NHẬN DIỆN */}
          <section className="form-section-box">
            <h3 className="text-base font-bold mb-sm text-slate-800 dark:text-slate-100 flex items-center gap-xs">
              <span>🖼️</span> 4. Ảnh Bìa & Nhận Diện (Tối Ưu WebP Tự Động)
            </h3>
            <p className="muted text-xs mb-sm">
              Tải ảnh trực tiếp từ máy của bạn. Hệ thống tự động nén dung lượng và chuyển đổi sang định dạng WebP tiêu chuẩn (tối đa 10MB).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <ImageUploader
                id="createEvBanner"
                label="Ảnh bìa ngang (Banner 16:9)"
                hint="Khuyến nghị: 1920×1080px. Hiển thị đầu trang chi tiết sự kiện."
                value={formData.banner}
                aspect="banner"
                maxWidth={1920}
                maxHeight={1080}
                onChange={(url) => setFormData((prev) => ({ ...prev, banner: url }))}
              />

              <ImageUploader
                id="createEvCover"
                label="Ảnh đại diện (Poster / Thumbnail)"
                hint="Khuyến nghị: 1200×1200px hoặc 4:3. Hiển thị trên thẻ sự kiện."
                value={formData.cover}
                aspect="cover"
                maxWidth={1200}
                maxHeight={1200}
                onChange={(url) => setFormData((prev) => ({ ...prev, cover: url }))}
              />
            </div>
          </section>

          {/* PHẦN 5: NỘI DUNG GIỚI THIỆU & LỊCH TRÌNH */}
          <section className="form-section-box">
            <h3 className="text-base font-bold mb-sm text-slate-800 dark:text-slate-100 flex items-center gap-xs">
              <span>📝</span> 5. Mô Tả Chi Tiết & Lịch Trình (Blog-style Blocks)
            </h3>
            <div className="form-group mb-sm">
              <label htmlFor="createEvDesc" className="font-semibold text-sm">
                Mô Tả Tổng Quan
              </label>
              <textarea
                id="createEvDesc"
                rows="4"
                className="textarea"
                placeholder="Giới thiệu mục đích sự kiện, diễn giả nổi tiếng, các hoạt động hấp dẫn và lưu ý dành cho người tham dự..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            {/* Multimedia Blocks */}
            <div className="border-t pt-sm mt-sm">
              <div className="flex justify-between items-center mb-sm">
                <span className="font-semibold text-xs text-muted">Các khối nội dung mở rộng (Multimedia Blocks):</span>
                <div className="flex gap-xs">
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('text')}>
                    + Đoạn văn
                  </button>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('agenda')}>
                    + Mốc lịch trình
                  </button>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={() => addBlock('media')}>
                    + Ảnh minh họa
                  </button>
                </div>
              </div>

              {formData.blocks && formData.blocks.length > 0 && (
                <div className="space-y-3">
                  {formData.blocks.map((b, idx) => (
                    <div key={b.id} className="card p-sm bg-slate-50 dark:bg-slate-900 border">
                      <div className="flex justify-between items-center mb-xs">
                        <span className="badge badge-info text-xs font-semibold">
                          Khối #{idx + 1}: {b.type.toUpperCase()}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-danger"
                          onClick={() => removeBlock(b.id)}
                        >
                          ✕ Xóa khối
                        </button>
                      </div>

                      {b.type === 'agenda' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-xs mb-xs">
                          <input
                            type="text"
                            className="input input-sm"
                            placeholder="Khung giờ (VD: 08:30 - 09:30)"
                            value={b.time || ''}
                            onChange={(e) => updateBlock(b.id, 'time', e.target.value)}
                          />
                          <input
                            type="text"
                            className="input input-sm"
                            placeholder="Tiêu đề hoạt động"
                            value={b.title || ''}
                            onChange={(e) => updateBlock(b.id, 'title', e.target.value)}
                          />
                        </div>
                      )}

                      <textarea
                        rows="2"
                        className="textarea text-xs"
                        placeholder="Nội dung chi tiết của khối..."
                        value={b.content || ''}
                        onChange={(e) => updateBlock(b.id, 'content', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* PHẦN 6: CHÍNH SÁCH HOÀN TIỀN & PHÒNG CHỜ */}
          <section className="form-section-box">
            <h3 className="text-base font-bold mb-sm text-slate-800 dark:text-slate-100 flex items-center gap-xs">
              <span>🛡️</span> 6. Chính Sách Hoàn Hủy & Phòng Chờ Ảo
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-sm mb-sm">
              <div className="form-group mb-0">
                <label className="text-xs font-semibold">Cho phép người mua hủy vé?</label>
                <select
                  className="select select-sm"
                  value={formData.allow_refunds ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, allow_refunds: e.target.value === 'true' })}
                >
                  <option value="true">Có (Cho phép hoàn vé)</option>
                  <option value="false">Không (Vé không hoàn tiền)</option>
                </select>
              </div>

              <div className="form-group mb-0">
                <label className="text-xs font-semibold">Tối đa sau khi mua (ngày):</label>
                <input
                  type="number"
                  className="input input-sm"
                  min="1"
                  max="30"
                  value={formData.refund_max_days}
                  onChange={(e) => setFormData({ ...formData, refund_max_days: Number(e.target.value) })}
                />
              </div>

              <div className="form-group mb-0">
                <label className="text-xs font-semibold">Tối thiểu trước sự kiện (ngày):</label>
                <input
                  type="number"
                  className="input input-sm"
                  min="1"
                  max="30"
                  value={formData.refund_min_days_before_event}
                  onChange={(e) => setFormData({ ...formData, refund_min_days_before_event: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="border-t pt-sm mt-sm flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm">Phòng Chờ Ảo Chống Sập Web (Virtual Waiting Room)</span>
                <p className="text-xs text-muted m-0">Kích hoạt xếp hàng tự động khi có trên 100+ người cùng đặt vé.</p>
              </div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={formData.queue_enabled}
                  onChange={(e) => setFormData({ ...formData, queue_enabled: e.target.checked })}
                />
                <span className="slider round" />
              </label>
            </div>
          </section>

          {/* ACTION BUTTONS */}
          <div className="flex justify-between items-center pt-md border-t">
            <Link to="/organizer" className="btn btn-secondary">
              Hủy Bỏ
            </Link>
            <div className="flex gap-sm">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setFormData((prev) => ({ ...prev, status: 'DRAFT' }));
                  document.querySelector('form').requestSubmit();
                }}
              >
                Lưu Bản Nháp (DRAFT)
              </button>
              <button type="submit" disabled={saving} className="btn btn-primary px-lg font-bold">
                {saving ? 'Đang Tạo Sự Kiện...' : '✓ Xuất Bản Sự Kiện Mới (LIVE)'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEventPage;
