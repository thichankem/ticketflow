import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ImageUploader } from '../ImageUploader';
import { StatusBadge } from '../common/StatusBadge';
import { Icon } from '../ui/Icon';

export function validateEventDateRange(startDate, endDate) {
  if (!startDate || !endDate) return { valid: false, error: 'Start and end date are required' };
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'Định dạng thời gian không hợp lệ.' };
  }
  if (end.getTime() < start.getTime()) {
    return { valid: false, error: 'Thời gian kết thúc sự kiện phải diễn ra sau hoặc cùng lúc với thời gian bắt đầu.' };
  }
  return { valid: true };
}

export const EventForm = ({
  initialData = null,
  eventId = null,
  onSave,
  onCancel,
  includeTiers = false,
}) => {
  const isEditing = Boolean(eventId || initialData?.id);

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
      let rawBlocks = initialData.blocks || initialData.blog_blocks || initialData.location_details?.blog_blocks || [];
      if (!Array.isArray(rawBlocks)) {
        rawBlocks = [];
      }

      // If there's an existing schedule array outside blocks, convert it to a schedule block
      if (
        initialData.schedule &&
        Array.isArray(initialData.schedule) &&
        initialData.schedule.length > 0 &&
        !rawBlocks.some((b) => b.type === 'schedule' || b.type === 'timeline')
      ) {
        rawBlocks = [
          ...rawBlocks,
          {
            id: `sch_${Date.now()}`,
            type: 'schedule',
            title: 'Lịch trình chi tiết (Agenda)',
            items: initialData.schedule.map((it, idx) => ({
              id: `item_${idx}`,
              time: it.time || '',
              title: it.title || '',
              desc: it.desc || it.description || '',
            })),
          },
        ];
      }

      const normalizedBlocks = rawBlocks.map((b, idx) => ({
        id: b.id || `block_${Date.now()}_${idx}`,
        type:
          b.type === 'schedule' || b.type === 'timeline'
            ? 'schedule'
            : b.type === 'media' || b.type === 'image' || b.media_url || b.url
            ? 'media'
            : 'paragraph',
        title: b.title || '',
        content: b.content || b.text || '',
        text: b.text || b.content || '',
        url: b.url || b.media_url || '',
        media_url: b.media_url || b.url || '',
        caption: b.caption || '',
        items: Array.isArray(b.items)
          ? b.items.map((it, iIdx) => ({
              id: it.id || `item_${iIdx}`,
              time: it.time || '',
              title: it.title || '',
              desc: it.desc || it.description || '',
            }))
          : [],
      }));

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
        blocks: normalizedBlocks,
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
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      title:
        type === 'paragraph' || type === 'text'
          ? 'Đoạn văn bản'
          : type === 'media' || type === 'image'
          ? 'Hình ảnh sự kiện'
          : 'Lịch trình sự kiện (Agenda)',
      content: '',
      text: '',
      url: '',
      media_url: '',
      caption: '',
      items:
        type === 'schedule' || type === 'timeline'
          ? [
              {
                id: `item_${Date.now()}_1`,
                time: '08:30 - 09:00',
                title: 'Đón tiếp & Check-in',
                desc: 'Check-in bằng mã QR, nhận tài liệu sự kiện và tiệc trà chào mừng.',
              },
              {
                id: `item_${Date.now()}_2`,
                time: '09:00 - 10:30',
                title: 'Khai mạc & Nội dung chính',
                desc: 'Phát biểu khai mạc và phần trình bày của các diễn giả khách mời.',
              },
            ]
          : [],
    };

    setFormData((prev) => ({
      ...prev,
      blocks: [...(prev.blocks || []), newBlock],
    }));
  };

  const removeBlock = (id) => {
    setFormData((prev) => ({
      ...prev,
      blocks: (prev.blocks || []).filter((b) => b.id !== id),
    }));
  };

  const moveBlock = (index, direction) => {
    setFormData((prev) => {
      const blocks = [...(prev.blocks || [])];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= blocks.length) return prev;
      const temp = blocks[index];
      blocks[index] = blocks[targetIndex];
      blocks[targetIndex] = temp;
      return { ...prev, blocks };
    });
  };

  const updateBlock = (id, field, value) => {
    setFormData((prev) => ({
      ...prev,
      blocks: (prev.blocks || []).map((b) => {
        if (b.id !== id) return b;
        const updated = { ...b, [field]: value };
        if (field === 'content') updated.text = value;
        if (field === 'text') updated.content = value;
        if (field === 'url') updated.media_url = value;
        if (field === 'media_url') updated.url = value;
        return updated;
      }),
    }));
  };

  // Schedule milestone helpers
  const addScheduleItem = (blockId) => {
    setFormData((prev) => ({
      ...prev,
      blocks: (prev.blocks || []).map((b) => {
        if (b.id !== blockId) return b;
        const items = b.items || [];
        const newItem = {
          id: `item_${Date.now()}_${items.length + 1}`,
          time: '',
          title: '',
          desc: '',
        };
        return { ...b, items: [...items, newItem] };
      }),
    }));
  };

  const updateScheduleItem = (blockId, itemId, field, value) => {
    setFormData((prev) => ({
      ...prev,
      blocks: (prev.blocks || []).map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          items: (b.items || []).map((it) => {
            if (it.id !== itemId) return it;
            const updated = { ...it, [field]: value };
            if (field === 'desc') updated.description = value;
            if (field === 'description') updated.desc = value;
            return updated;
          }),
        };
      }),
    }));
  };

  const removeScheduleItem = (blockId, itemId) => {
    setFormData((prev) => ({
      ...prev,
      blocks: (prev.blocks || []).map((b) => {
        if (b.id !== blockId) return b;
        return {
          ...b,
          items: (b.items || []).filter((it) => it.id !== itemId),
        };
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!formData.title.trim()) {
      setErrorNotice('Vui lòng nhập tên sự kiện.');
      return;
    }

    if (formData.start_date && formData.end_date) {
      const start = new Date(formData.start_date);
      const end = new Date(formData.end_date);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        setErrorNotice('Định dạng thời gian không hợp lệ.');
        return;
      }
      if (end.getTime() < start.getTime()) {
        setErrorNotice('Thời gian kết thúc sự kiện phải diễn ra sau hoặc cùng lúc với thời gian bắt đầu.');
        return;
      }
    }

    setSaving(true);
    setErrorNotice(null);

    try {
      const payload = {
        ...formData,
        blocks: formData.blocks || [],
        blog_blocks: formData.blocks || [],
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
        <h2 className="card-title text-lg font-bold mb-md">1. Thông tin cơ bản</h2>
        <div className="grid grid-2 gap-md">
          <div className="form-group">
            <label htmlFor="event-title-input" className="form-label required">Tên sự kiện</label>
            <input
              id="event-title-input"
              type="text"
              name="title"
              className="input"
              value={formData.title}
              onChange={handleChange}
              placeholder="VD: Tech Conference Vietnam 2026"
              required
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="event-category-select" className="form-label">Thể loại sự kiện</label>
            <select
              id="event-category-select"
              name="category"
              className="select"
              value={formData.category}
              onChange={handleChange}
              disabled={saving}
            >
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
            <label htmlFor="event-status-select" className="form-label">Trạng thái phát hành</label>
            <select
              id="event-status-select"
              name="status"
              className="select"
              value={formData.status}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="LIVE">Mở bán công khai (LIVE)</option>
              <option value="DRAFT">Lưu bản nháp (DRAFT)</option>
              {isEditing && (
                <option value="PAUSED">Tạm ngưng nhận đăng ký (PAUSED)</option>
              )}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="event-province-select" className="form-label">Tỉnh / Thành phố tổ chức</label>
            <select
              id="event-province-select"
              name="province"
              className="select"
              value={formData.province}
              onChange={handleChange}
              disabled={saving}
            >
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
            <label htmlFor="event-location-input" className="form-label">Địa điểm cụ thể</label>
            <input
              id="event-location-input"
              type="text"
              name="location"
              className="input"
              value={formData.location}
              onChange={handleChange}
              placeholder="VD: Trung tâm Hội nghị SECC, 799 Nguyễn Văn Linh, Q.7, TP.HCM"
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="event-start-date-input" className="form-label">Thời gian bắt đầu</label>
            <input
              id="event-start-date-input"
              type="datetime-local"
              name="start_date"
              className="input"
              value={formData.start_date}
              onChange={handleChange}
              disabled={saving}
            />
          </div>

          <div className="form-group">
            <label htmlFor="event-end-date-input" className="form-label">Thời gian kết thúc</label>
            <input
              id="event-end-date-input"
              type="datetime-local"
              name="end_date"
              className="input"
              value={formData.end_date}
              onChange={handleChange}
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-group mt-md">
          <label htmlFor="event-description-textarea" className="form-label">Mô tả tóm tắt sự kiện</label>
          <textarea
            id="event-description-textarea"
            name="description"
            className="input textarea"
            rows="3"
            value={formData.description}
            onChange={handleChange}
            placeholder="Mô tả ngắn gọn về quy mô, đối tượng tham gia và điểm nổi bật..."
            disabled={saving}
          />
        </div>
      </div>

      {/* Media Uploads */}
      <div className="card mb-lg p-lg">
        <h2 className="card-title text-lg font-bold mb-md">2. Hình ảnh & Banner quảng bá</h2>
        <div className="grid grid-2 gap-lg">
          <div>
            <label className="form-label font-semibold mb-xs">Ảnh bìa (Cover Image - 1:1 hoặc 4:3)</label>
            <ImageUploader
              id="event-cover-uploader"
              value={formData.cover}
              eventId={eventId}
              mediaType="cover"
              aspect="cover"
              onChange={(url) => setFormData((prev) => ({ ...prev, cover: url }))}
            />
          </div>
          <div>
            <label className="form-label font-semibold mb-xs">Ảnh biểu ngữ (Banner Image - 16:9)</label>
            <ImageUploader
              id="event-banner-uploader"
              value={formData.banner}
              eventId={eventId}
              mediaType="banner"
              aspect="banner"
              onChange={(url) => setFormData((prev) => ({ ...prev, banner: url }))}
            />
          </div>
        </div>
      </div>

      {/* 3. Dynamic Content Blocks (Đoạn văn bản, Lịch trình, Hình ảnh) */}
      <div className="card mb-lg p-lg">
        <div className="flex justify-between items-center mb-md flex-wrap gap-sm border-b pb-sm">
          <div>
            <h2 className="card-title text-lg font-bold m-0 flex items-center gap-2">
              <Icon name="layers" size="sm" ariaHidden className="text-primary" />
              <span>3. Nội dung chi tiết & Các đoạn mở rộng</span>
            </h2>
            <p className="text-muted text-xs m-0 mt-0.5">
              Thêm các đoạn văn bản giới thiệu, lịch trình chi tiết (timeline mốc thời gian) và hình ảnh để hiển thị trên trang chi tiết sự kiện của người mua vé.
            </p>
          </div>

          <div className="flex items-center gap-xs flex-wrap">
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={() => addBlock('paragraph')}
              disabled={saving}
              title="Thêm đoạn văn bản mới"
            >
              <Icon name="plus" size="xs" ariaHidden />
              <span>+ Đoạn văn bản</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={() => addBlock('schedule')}
              disabled={saving}
              title="Thêm đoạn lịch trình sự kiện"
            >
              <Icon name="clock" size="xs" ariaHidden />
              <span>+ Đoạn lịch trình</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={() => addBlock('media')}
              disabled={saving}
              title="Thêm đoạn hình ảnh sự kiện"
            >
              <Icon name="image" size="xs" ariaHidden />
              <span>+ Đoạn ảnh</span>
            </button>
          </div>
        </div>

        {/* Blocks List */}
        {(!formData.blocks || formData.blocks.length === 0) ? (
          <div className="p-lg text-center border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50 text-muted">
            <p className="text-sm m-0 mb-xs font-semibold">Chưa có đoạn nội dung mở rộng nào.</p>
            <p className="text-xs m-0 mb-md">
              Bạn có thể tự thêm các đoạn văn bản (giới thiệu diễn giả, nội quy), lịch trình (các mốc thời gian và mô tả chi tiết), hoặc hình ảnh minh họa cho sự kiện.
            </p>
            <div className="flex justify-center gap-xs flex-wrap">
              <button
                type="button"
                className="btn btn-outline btn-sm flex items-center gap-1"
                onClick={() => addBlock('paragraph')}
                disabled={saving}
              >
                <Icon name="plus" size="xs" ariaHidden />
                <span>+ Thêm đoạn văn bản</span>
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm flex items-center gap-1"
                onClick={() => addBlock('schedule')}
                disabled={saving}
              >
                <Icon name="clock" size="xs" ariaHidden />
                <span>+ Thêm đoạn lịch trình</span>
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm flex items-center gap-1"
                onClick={() => addBlock('media')}
                disabled={saving}
              >
                <Icon name="image" size="xs" ariaHidden />
                <span>+ Thêm đoạn ảnh</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-md">
            {formData.blocks.map((block, bIdx) => (
              <div
                key={block.id || bIdx}
                className="card p-md border rounded-lg bg-slate-50/60 dark:bg-slate-900/40"
                style={{ borderColor: 'var(--border, #cbd5e1)' }}
              >
                {/* Block Header Toolbar */}
                <div className="flex justify-between items-center mb-sm pb-xs border-b flex-wrap gap-xs">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-primary font-mono text-xs">#{bIdx + 1}</span>
                    <span className="font-semibold text-sm flex items-center gap-1.5">
                      {block.type === 'schedule' || block.type === 'timeline' ? (
                        <>
                          <Icon name="clock" size="xs" ariaHidden className="text-amber-500" />
                          <span>Đoạn Lịch Trình (Agenda)</span>
                        </>
                      ) : block.type === 'media' || block.type === 'image' ? (
                        <>
                          <Icon name="image" size="xs" ariaHidden className="text-blue-500" />
                          <span>Đoạn Hình Ảnh</span>
                        </>
                      ) : (
                        <>
                          <Icon name="file-text" size="xs" ariaHidden className="text-emerald-500" />
                          <span>Đoạn Văn Bản</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => moveBlock(bIdx, -1)}
                      disabled={bIdx === 0 || saving}
                      title="Di chuyển đoạn lên trên"
                    >
                      ↑ Lên
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => moveBlock(bIdx, 1)}
                      disabled={bIdx === formData.blocks.length - 1 || saving}
                      title="Di chuyển đoạn xuống dưới"
                    >
                      ↓ Xuống
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs ml-1 flex items-center gap-1"
                      onClick={() => removeBlock(block.id)}
                      disabled={saving}
                      title="Xóa đoạn này"
                    >
                      <Icon name="trash" size="xs" ariaHidden />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>

                {/* BLOCK TYPE 1: PARAGRAPH / TEXT */}
                {(block.type === 'paragraph' || block.type === 'text') && (
                  <div className="space-y-sm">
                    <div className="form-group">
                      <label className="form-label text-xs font-semibold">Tiêu đề đoạn (tùy chọn)</label>
                      <input
                        type="text"
                        className="input input-sm"
                        placeholder="Ví dụ: Giới thiệu diễn giả, Điểm nhấn sự kiện, Quy định tham dự..."
                        value={block.title || ''}
                        onChange={(e) => updateBlock(block.id, 'title', e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label text-xs font-semibold required">Nội dung văn bản</label>
                      <textarea
                        className="textarea"
                        rows={4}
                        placeholder="Nhập nội dung chi tiết cho đoạn văn bản này..."
                        value={block.content || block.text || ''}
                        onChange={(e) => updateBlock(block.id, 'content', e.target.value)}
                        disabled={saving}
                      />
                    </div>
                  </div>
                )}

                {/* BLOCK TYPE 2: SCHEDULE / TIMELINE */}
                {(block.type === 'schedule' || block.type === 'timeline') && (
                  <div className="space-y-md">
                    <div className="form-group">
                      <label className="form-label text-xs font-semibold">Tiêu đề khối lịch trình</label>
                      <input
                        type="text"
                        className="input input-sm"
                        placeholder="Ví dụ: Lịch trình chi tiết sự kiện (Agenda), Lịch trình ngày 1..."
                        value={block.title || ''}
                        onChange={(e) => updateBlock(block.id, 'title', e.target.value)}
                        disabled={saving}
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-xs">
                        <label className="text-xs font-semibold text-muted">
                          Các mốc thời gian trong lịch trình ({block.items?.length || 0})
                        </label>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs flex items-center gap-1"
                          onClick={() => addScheduleItem(block.id)}
                          disabled={saving}
                        >
                          <Icon name="plus" size="xs" ariaHidden />
                          <span>+ Thêm mốc thời gian</span>
                        </button>
                      </div>

                      {(!block.items || block.items.length === 0) ? (
                        <div className="p-sm text-center border-dashed rounded text-xs text-muted bg-white dark:bg-slate-900">
                          Chưa có mốc thời gian nào. Bấm <b>"+ Thêm mốc thời gian"</b> để thêm mốc giờ & mô tả.
                        </div>
                      ) : (
                        <div className="space-y-xs">
                          {block.items.map((it, itemIdx) => (
                            <div
                              key={it.id || itemIdx}
                              className="card p-sm border flex flex-col md:flex-row items-start md:items-center gap-sm bg-white dark:bg-slate-900"
                            >
                              <div style={{ minWidth: '150px' }} className="w-full md:w-auto">
                                <label className="text-xs font-medium text-muted mb-0.5 block">Thời gian</label>
                                <input
                                  type="text"
                                  className="input input-sm w-full"
                                  placeholder="08:00 - 09:00"
                                  value={it.time || ''}
                                  onChange={(e) => updateScheduleItem(block.id, it.id, 'time', e.target.value)}
                                  disabled={saving}
                                />
                              </div>

                              <div className="flex-1 w-full">
                                <label className="text-xs font-medium text-muted mb-0.5 block">Tiêu đề hoạt động</label>
                                <input
                                  type="text"
                                  className="input input-sm w-full"
                                  placeholder="VD: Đón tiếp & Check-in"
                                  value={it.title || ''}
                                  onChange={(e) => updateScheduleItem(block.id, it.id, 'title', e.target.value)}
                                  disabled={saving}
                                />
                              </div>

                              <div className="flex-1 w-full">
                                <label className="text-xs font-medium text-muted mb-0.5 block">Mô tả chi tiết (Description)</label>
                                <input
                                  type="text"
                                  className="input input-sm w-full"
                                  placeholder="VD: Nhận thẻ đeo, quà tặng và teabreak"
                                  value={it.desc || it.description || ''}
                                  onChange={(e) => updateScheduleItem(block.id, it.id, 'desc', e.target.value)}
                                  disabled={saving}
                                />
                              </div>

                              <button
                                type="button"
                                className="btn btn-ghost btn-sm text-danger md:mt-3"
                                onClick={() => removeScheduleItem(block.id, it.id)}
                                disabled={saving}
                                title="Xóa mốc thời gian này"
                              >
                                <Icon name="trash" size="xs" ariaHidden />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* BLOCK TYPE 3: MEDIA / IMAGE */}
                {(block.type === 'media' || block.type === 'image') && (
                  <div className="space-y-sm">
                    <div className="form-group">
                      <label className="form-label text-xs font-semibold">Tiêu đề ảnh (tùy chọn)</label>
                      <input
                        type="text"
                        className="input input-sm"
                        placeholder="Ví dụ: Sân khấu chính, Không gian triển lãm..."
                        value={block.title || ''}
                        onChange={(e) => updateBlock(block.id, 'title', e.target.value)}
                        disabled={saving}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label text-xs font-semibold">Tải ảnh lên hoặc nhập URL</label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-sm items-start">
                        <ImageUploader
                          id={`uploader-${block.id}`}
                          value={block.url || block.media_url || ''}
                          eventId={eventId}
                          mediaType="gallery"
                          aspect="wide"
                          onChange={(url) => updateBlock(block.id, 'url', url)}
                        />
                        <div className="space-y-xs">
                          <label className="text-xs text-muted block">Hoặc dán trực tiếp đường dẫn hình ảnh:</label>
                          <input
                            type="url"
                            className="input input-sm"
                            placeholder="https://example.com/photo.jpg"
                            value={block.url || block.media_url || ''}
                            onChange={(e) => updateBlock(block.id, 'url', e.target.value)}
                            disabled={saving}
                          />
                          <label className="text-xs text-muted block mt-2">Chú thích ảnh (Caption):</label>
                          <input
                            type="text"
                            className="input input-sm"
                            placeholder="Ví dụ: Hội trường chính với sức chứa 500 khách"
                            value={block.caption || ''}
                            onChange={(e) => updateBlock(block.id, 'caption', e.target.value)}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Refund Policy Settings */}
      <div className="card mb-lg p-lg">
        <h2 className="card-title text-lg font-bold mb-md">4. Chính sách hoàn tiền vé</h2>
        <div className="grid grid-3 gap-md">
          <div className="form-group flex items-center gap-xs" style={{ paddingTop: '1.75rem' }}>
            <input
              id="event-allow-refunds"
              type="checkbox"
              name="allow_refunds"
              checked={formData.allow_refunds}
              onChange={handleChange}
              disabled={saving}
            />
            <label htmlFor="event-allow-refunds" className="flex items-center gap-xs cursor-pointer">
              <span className="font-semibold">Cho phép người mua hủy vé</span>
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="event-refund-max-days" className="form-label">Số ngày tối đa sau khi mua</label>
            <input
              id="event-refund-max-days"
              type="number"
              name="refund_max_days"
              className="input"
              value={formData.refund_max_days}
              onChange={handleChange}
              min="1"
              max="60"
              disabled={saving || !formData.allow_refunds}
            />
            <span className="text-xs text-muted">Ví dụ: Được hủy vé trong 7 ngày đầu</span>
          </div>

          <div className="form-group">
            <label htmlFor="event-refund-min-days" className="form-label">Số ngày tối thiểu trước sự kiện</label>
            <input
              id="event-refund-min-days"
              type="number"
              name="refund_min_days_before_event"
              className="input"
              value={formData.refund_min_days_before_event}
              onChange={handleChange}
              min="0"
              max="30"
              disabled={saving || !formData.allow_refunds}
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
              <h2 className="card-title text-lg font-bold m-0">5. Thiết lập Hạng vé ban đầu</h2>
              <p className="text-muted text-xs m-0">Người mua chọn hạng vé khi mua, xếp chỗ tự do (Open Seating).</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAddTier}
              disabled={saving}
            >
              + Thêm hạng vé
            </button>
          </div>

          <div className="space-y-sm">
            {ticketTiers.map((t, idx) => (
              <div key={t.id} className="card p-md border flex flex-wrap items-center gap-md">
                <span className="font-bold text-muted">#{idx + 1}</span>
                <label htmlFor={`tier-name-${t.id}`} className="sr-only">Tên hạng vé #{idx + 1}</label>
                <input
                  id={`tier-name-${t.id}`}
                  type="text"
                  className="input flex-1"
                  style={{ minWidth: '160px' }}
                  placeholder="Tên hạng vé (VD: VIP, Standard)"
                  value={t.name}
                  onChange={(e) => handleUpdateTier(t.id, 'name', e.target.value)}
                  required
                  disabled={saving}
                />
                <label htmlFor={`tier-type-${t.id}`} className="sr-only">Phân loại hạng vé #{idx + 1}</label>
                <select
                  id={`tier-type-${t.id}`}
                  className="select"
                  style={{ width: '130px' }}
                  value={t.type}
                  onChange={(e) => handleUpdateTier(t.id, 'type', e.target.value)}
                  disabled={saving}
                >
                  <option value="PAID">Vé trả phí</option>
                  <option value="FREE">Miễn phí</option>
                  <option value="DONATION">Ủng hộ</option>
                </select>
                {t.type !== 'FREE' && (
                  <>
                    <label htmlFor={`tier-price-${t.id}`} className="sr-only">Giá vé #{idx + 1}</label>
                    <input
                      id={`tier-price-${t.id}`}
                      type="number"
                      className="input"
                      style={{ width: '130px' }}
                      placeholder="Giá vé (VNĐ)"
                      value={t.price}
                      onChange={(e) => handleUpdateTier(t.id, 'price', e.target.value)}
                      min="0"
                      step="1000"
                      disabled={saving}
                    />
                  </>
                )}
                <label htmlFor={`tier-qty-${t.id}`} className="sr-only">Số lượng vé #{idx + 1}</label>
                <input
                  id={`tier-qty-${t.id}`}
                  type="number"
                  className="input"
                  style={{ width: '110px' }}
                  placeholder="Số lượng"
                  value={t.total_quantity}
                  onChange={(e) => handleUpdateTier(t.id, 'total_quantity', e.target.value)}
                  min="1"
                  disabled={saving}
                />
                {ticketTiers.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => handleRemoveTier(t.id)}
                    disabled={saving}
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
