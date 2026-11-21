import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { ImageUploader } from '../ImageUploader';
import { StatusBadge } from '../common/StatusBadge';
import { Icon } from '../ui/Icon';
import { EventBasicSection } from './form/EventBasicSection';
import { EventBlocksSection } from './form/EventBlocksSection';
import { EventMediaSection } from './form/EventMediaSection';
import { EventRefundSection } from './form/EventRefundSection';
import { EventTiersSection } from './form/EventTiersSection';

/**
 * Validates that an event date range has valid chronologically ordered start and end timestamps.
 *
 * @param {string} startDate - ISO or datetime-local formatted start date string
 * @param {string} endDate - ISO or datetime-local formatted end date string
 * @returns {{ valid: boolean, error?: string }} Validation outcome with localized message
 */
export function validateEventDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return { valid: false, error: 'Start and end date are required' };
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { valid: false, error: 'Định dạng thời gian không hợp lệ.' };
  }
  if (end.getTime() < start.getTime()) {
    return {
      valid: false,
      error: 'Thời gian kết thúc sự kiện phải diễn ra sau hoặc cùng lúc với thời gian bắt đầu.',
    };
  }
  return { valid: true };
}

/**
 * Default initial block content for newly created events
 */
const DEFAULT_INITIAL_BLOCKS = [
  {
    id: 'init_block_text_1',
    type: 'paragraph',
    title: 'Giới thiệu sự kiện',
    content:
      'Premier developer conference on cloud, AI and distributed systems. Three days of keynotes, hallway tracks, and late-night architecture reviews at Moscone Center.',
    text:
      'Premier developer conference on cloud, AI and distributed systems. Three days of keynotes, hallway tracks, and late-night architecture reviews at Moscone Center.',
  },
  {
    id: 'init_block_schedule_1',
    type: 'schedule',
    title: 'Lịch trình sự kiện',
    items: [
      {
        id: 'init_item_1',
        time: '08:30',
        title: 'Check-in & Đón khách',
        desc: 'Đón tiếp đại biểu, check-in mã vé QR và nhận tài liệu tham gia.',
      },
      {
        id: 'init_item_2',
        time: '09:30',
        title: 'Phiên thảo luận chính',
        desc: 'Khai mạc chương trình và phần trình bày từ các chuyên gia khách mời.',
      },
      {
        id: 'init_item_3',
        time: '16:30',
        title: 'Bế mạc & Giao lưu',
        desc: 'Tổng kết sự kiện, bế mạc và phiên giao lưu tự do.',
      },
    ],
  },
  {
    id: 'init_block_media_1',
    type: 'media',
    title: 'Sơ đồ chỗ ngồi',
    url: '/images/seat-map-theater.svg',
    media_url: '/images/seat-map-theater.svg',
    caption:
      'Nguyên tắc Open Seating: Sự kiện áp dụng quy chế ngồi/đứng tự do theo khu vực hạng vé đã mua. Vui lòng có mặt sớm trước giờ mở cửa để có vị trí quan sát tốt nhất trong phân khu của bạn.',
  },
];

/**
 * EventForm Component
 * Orchestrates event creation and modification workflows across modular sections:
 * Basic Info, Dynamic Blocks, Media Covers, Refund Policies, and Ticket Tiers.
 *
 * @param {Object} props
 * @param {Object} [props.initialData=null] - Preloaded event entity for editing
 * @param {number|string} [props.eventId=null] - Target event identifier
 * @param {Function} props.onSave - Callback invoked on successful validation with clean payload
 * @param {Function} props.onCancel - Callback invoked when the user cancels editing
 * @param {boolean} [props.includeTiers=false] - Whether to include initial ticket tier setup
 */
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
    blocks: initialData ? [] : DEFAULT_INITIAL_BLOCKS,
    pdf_attachments: [],
  });

  const [ticketTiers, setTicketTiers] = useState([
    {
      id: 't1',
      name: 'Standard Ticket',
      type: 'PAID',
      price: 150000,
      total_quantity: 100,
      min_per_order: 1,
      max_per_order: 5,
    },
  ]);

  const [provinces, setProvinces] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errorNotice, setErrorNotice] = useState(null);

  useEffect(() => {
    // Load provinces for location selector
    api.location
      .getProvinces()
      .then((res) => {
        if (Array.isArray(res)) setProvinces(res);
        else if (res?.provinces) setProvinces(res.provinces);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!initialData) return;

    let rawBlocks =
      initialData.blocks ||
      initialData.blog_blocks ||
      initialData.location_details?.blog_blocks ||
      [];
    if (!Array.isArray(rawBlocks)) {
      rawBlocks = [];
    }

    // Convert external schedule array to a schedule block if not already present
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

    const finalInitialBlocks =
      normalizedBlocks.length > 0 ? normalizedBlocks : DEFAULT_INITIAL_BLOCKS;

    setFormData({
      title: initialData.title || '',
      category: initialData.category || 'Tech',
      status: initialData.status || 'LIVE',
      location: initialData.location || '',
      province: initialData.province || 'Hồ Chí Minh',
      is_online: Boolean(initialData.is_online),
      online_url: initialData.online_url || '',
      start_date:
        initialData.start_date || initialData.starts_at
          ? new Date(initialData.start_date || initialData.starts_at)
              .toISOString()
              .slice(0, 16)
          : '',
      end_date:
        initialData.end_date || initialData.ends_at
          ? new Date(initialData.end_date || initialData.ends_at)
              .toISOString()
              .slice(0, 16)
          : '',
      description: initialData.description || '',
      banner:
        initialData.banner ||
        initialData.banner_url ||
        initialData.cover ||
        '',
      cover: initialData.cover || initialData.image_url || '',
      allow_refunds:
        initialData.allow_refunds !== undefined
          ? initialData.allow_refunds
          : true,
      refund_max_days: initialData.refund_max_days || 7,
      refund_min_days_before_event:
        initialData.refund_min_days_before_event || 3,
      refund_policy_type: initialData.refund_policy_type || 'STANDARD',
      blocks: finalInitialBlocks,
      pdf_attachments: initialData.pdf_attachments || [],
    });
  }, [initialData]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Block management handlers
  const addBlock = (type = 'paragraph') => {
    const newBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type,
      title:
        type === 'schedule'
          ? 'Lịch trình sự kiện (Agenda)'
          : type === 'media'
          ? 'Hình ảnh / Sơ đồ'
          : 'Tiêu đề đoạn văn bản',
      content: '',
      text: '',
      url: type === 'media' ? '/images/seat-map-theater.svg' : '',
      media_url: type === 'media' ? '/images/seat-map-theater.svg' : '',
      caption: '',
      items:
        type === 'schedule'
          ? [
              {
                id: `item_1`,
                time: '09:00',
                title: 'Bắt đầu hoạt động',
                desc: 'Mô tả chi tiết',
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

  // Ticket tier handlers
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
    setTicketTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!formData.title.trim()) {
      setErrorNotice('Vui lòng nhập tên sự kiện.');
      return;
    }

    if (formData.start_date && formData.end_date) {
      const dateCheck = validateEventDateRange(
        formData.start_date,
        formData.end_date
      );
      if (!dateCheck.valid) {
        setErrorNotice(dateCheck.error);
        return;
      }
    }

    setSaving(true);
    setErrorNotice(null);

    try {
      const firstTextBlock = (formData.blocks || []).find(
        (b) => b.type === 'paragraph' || b.type === 'text'
      );
      const finalDescription =
        formData.description?.trim() ||
        firstTextBlock?.content?.trim() ||
        firstTextBlock?.text?.trim() ||
        '';

      const payload = {
        ...formData,
        description: finalDescription,
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

      {/* 1. Basic Information */}
      <EventBasicSection
        formData={formData}
        onChange={handleChange}
        provinces={provinces}
        isEditing={isEditing}
        saving={saving}
      />

      {/* 2. Dynamic Content Blocks */}
      <EventBlocksSection
        blocks={formData.blocks}
        onAddBlock={addBlock}
        onRemoveBlock={removeBlock}
        onMoveBlock={moveBlock}
        onUpdateBlock={updateBlock}
        onAddScheduleItem={addScheduleItem}
        onUpdateScheduleItem={updateScheduleItem}
        onRemoveScheduleItem={removeScheduleItem}
        eventId={eventId}
        saving={saving}
      />

      {/* 3. Media Covers & Banners */}
      <EventMediaSection
        cover={formData.cover}
        banner={formData.banner}
        onCoverChange={(url) =>
          setFormData((prev) => ({ ...prev, cover: url }))
        }
        onBannerChange={(url) =>
          setFormData((prev) => ({ ...prev, banner: url }))
        }
        eventId={eventId}
      />

      {/* 4. Refund Policy Settings */}
      <EventRefundSection
        allowRefunds={formData.allow_refunds}
        refundMaxDays={formData.refund_max_days}
        refundMinDaysBeforeEvent={formData.refund_min_days_before_event}
        onChange={handleChange}
        saving={saving}
      />

      {/* 5. Optional Initial Ticket Tiers */}
      {includeTiers && (
        <EventTiersSection
          tiers={ticketTiers}
          onAddTier={handleAddTier}
          onUpdateTier={handleUpdateTier}
          onRemoveTier={handleRemoveTier}
          saving={saving}
        />
      )}

      {/* Form Action Buttons */}
      <div className="flex justify-end gap-sm mt-xl pt-md border-t">
        {onCancel && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Hủy bỏ
          </button>
        )}
        <button
          type="submit"
          className="btn btn-primary min-w-[140px] flex items-center justify-center gap-2"
          disabled={saving}
        >
          {saving ? (
            <>
              <span className="spinner spinner-sm" aria-hidden="true" />
              <span>Đang lưu...</span>
            </>
          ) : (
            <span>{isEditing ? 'Cập nhật sự kiện' : 'Tạo sự kiện'}</span>
          )}
        </button>
      </div>
    </form>
  );
};

export default EventForm;
