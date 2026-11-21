import React from 'react';
import { ImageUploader } from '../../ImageUploader';
import { Icon } from '../../ui/Icon';

/**
 * EventBlocksSection Component
 * Manages rich dynamic content blocks for an event:
 * - Paragraph blocks (Rich descriptive text)
 * - Schedule / Timeline blocks (Agenda with time, title, description)
 * - Media blocks (Images, diagrams, seat maps with captions)
 *
 * @param {Object} props
 * @param {Array} props.blocks - Array of block items
 * @param {Function} props.onAddBlock - Callback to append a new block type
 * @param {Function} props.onRemoveBlock - Callback to delete a block by id
 * @param {Function} props.onMoveBlock - Callback to reorder block by index delta
 * @param {Function} props.onUpdateBlock - Callback to update block field value
 * @param {Function} props.onAddScheduleItem - Callback to add schedule milestone
 * @param {Function} props.onUpdateScheduleItem - Callback to update schedule milestone
 * @param {Function} props.onRemoveScheduleItem - Callback to delete schedule milestone
 * @param {number|string} [props.eventId] - Event ID for image upload association
 * @param {boolean} [props.saving=false] - Whether form is currently saving
 */
export const EventBlocksSection = ({
  blocks = [],
  onAddBlock,
  onRemoveBlock,
  onMoveBlock,
  onUpdateBlock,
  onAddScheduleItem,
  onUpdateScheduleItem,
  onRemoveScheduleItem,
  eventId = null,
  saving = false,
}) => {
  return (
    <div
      className="card mb-lg p-lg border-2"
      style={{ borderColor: 'var(--primary, #0f766e)' }}
    >
      <div className="flex justify-between items-center mb-md flex-wrap gap-sm border-b pb-sm">
        <div>
          <h2 className="card-title text-lg font-bold m-0 flex items-center gap-2 text-primary">
            <Icon name="layers" size="sm" ariaHidden />
            <span>2. Tùy chỉnh Nội Dung & Lịch Trình Chi Tiết Sự Kiện</span>
          </h2>
          <p className="text-muted text-xs m-0 mt-1">
            Tùy ý tạo nhiều đoạn: <b>Đoạn văn bản</b> (giới thiệu),{' '}
            <b>Đoạn lịch trình</b> (các mốc thời gian & mô tả), và{' '}
            <b>Đoạn ảnh / Sơ đồ</b>. Toàn bộ các khối này sẽ hiển thị trực tiếp
            cho khách mua vé xem tại trang sự kiện.
          </p>
        </div>

        <div className="flex items-center gap-xs flex-wrap">
          <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => onAddBlock('paragraph')}
            disabled={saving}
            title="Thêm đoạn văn bản mới"
          >
            <Icon name="plus" size="xs" ariaHidden />
            <span>+ Đoạn văn bản</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => onAddBlock('schedule')}
            disabled={saving}
            title="Thêm đoạn lịch trình sự kiện"
          >
            <Icon name="clock" size="xs" ariaHidden />
            <span>+ Đoạn lịch trình</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => onAddBlock('media')}
            disabled={saving}
            title="Thêm đoạn hình ảnh sự kiện"
          >
            <Icon name="image" size="xs" ariaHidden />
            <span>+ Đoạn ảnh / Sơ đồ</span>
          </button>
        </div>
      </div>

      {/* Blocks List */}
      {!blocks || blocks.length === 0 ? (
        <div className="p-lg text-center border-dashed rounded-lg bg-slate-50 dark:bg-slate-900/50 text-muted">
          <p className="text-sm m-0 mb-xs font-semibold">
            Chưa có đoạn nội dung mở rộng nào.
          </p>
          <p className="text-xs m-0 mb-md">
            Bạn có thể tự thêm các đoạn văn bản (giới thiệu diễn giả, nội quy),
            lịch trình (các mốc thời gian và mô tả chi tiết), hoặc hình ảnh minh
            họa cho sự kiện.
          </p>
          <div className="flex justify-center gap-xs flex-wrap">
            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-1"
              onClick={() => onAddBlock('paragraph')}
              disabled={saving}
            >
              <Icon name="plus" size="xs" ariaHidden />
              <span>+ Thêm đoạn văn bản</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-1"
              onClick={() => onAddBlock('schedule')}
              disabled={saving}
            >
              <Icon name="clock" size="xs" ariaHidden />
              <span>+ Thêm đoạn lịch trình</span>
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm flex items-center gap-1"
              onClick={() => onAddBlock('media')}
              disabled={saving}
            >
              <Icon name="image" size="xs" ariaHidden />
              <span>+ Thêm đoạn ảnh / Sơ đồ</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-md">
          {blocks.map((block, bIdx) => (
            <div
              key={block.id || bIdx}
              className="card p-md border rounded-lg bg-slate-50/60 dark:bg-slate-900/40"
              style={{ borderColor: 'var(--border, #cbd5e1)' }}
            >
              {/* Block Header Toolbar */}
              <div className="flex justify-between items-center mb-sm pb-xs border-b flex-wrap gap-xs">
                <div className="flex items-center gap-2">
                  <span className="badge badge-primary font-mono text-xs">
                    #{bIdx + 1}
                  </span>
                  <span className="font-semibold text-sm flex items-center gap-1.5">
                    {block.type === 'schedule' || block.type === 'timeline' ? (
                      <>
                        <Icon
                          name="clock"
                          size="xs"
                          ariaHidden
                          className="text-amber-500"
                        />
                        <span>Đoạn Lịch Trình (Mốc thời gian - Agenda)</span>
                      </>
                    ) : block.type === 'media' || block.type === 'image' ? (
                      <>
                        <Icon
                          name="image"
                          size="xs"
                          ariaHidden
                          className="text-blue-500"
                        />
                        <span>Đoạn Hình Ảnh / Sơ Đồ</span>
                      </>
                    ) : (
                      <>
                        <Icon
                          name="file-text"
                          size="xs"
                          ariaHidden
                          className="text-emerald-500"
                        />
                        <span>Đoạn Văn Bản</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs inline-flex items-center gap-1"
                    onClick={() => onMoveBlock(bIdx, -1)}
                    disabled={bIdx === 0 || saving}
                    title="Di chuyển đoạn lên trên"
                  >
                    <Icon name="arrow-up" size="xs" ariaHidden />
                    <span>Lên</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs inline-flex items-center gap-1"
                    onClick={() => onMoveBlock(bIdx, 1)}
                    disabled={bIdx === blocks.length - 1 || saving}
                    title="Di chuyển đoạn xuống dưới"
                  >
                    <Icon name="arrow-down" size="xs" ariaHidden />
                    <span>Xuống</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-xs ml-1 flex items-center gap-1"
                    onClick={() => onRemoveBlock(block.id)}
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
                    <label className="form-label text-xs font-semibold">
                      Tiêu đề đoạn
                    </label>
                    <input
                      type="text"
                      className="input input-sm"
                      placeholder="Ví dụ: Giới thiệu sự kiện, Điểm nhấn, Quy định tham dự..."
                      value={block.title || ''}
                      onChange={(e) =>
                        onUpdateBlock(block.id, 'title', e.target.value)
                      }
                      disabled={saving}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label text-xs font-semibold required">
                      Nội dung văn bản
                    </label>
                    <textarea
                      className="textarea"
                      rows={4}
                      placeholder="Nhập nội dung chi tiết cho đoạn văn bản này..."
                      value={block.content || block.text || ''}
                      onChange={(e) =>
                        onUpdateBlock(block.id, 'content', e.target.value)
                      }
                      disabled={saving}
                    />
                  </div>
                </div>
              )}

              {/* BLOCK TYPE 2: SCHEDULE / TIMELINE */}
              {(block.type === 'schedule' || block.type === 'timeline') && (
                <div className="space-y-md">
                  <div className="form-group">
                    <label className="form-label text-xs font-semibold">
                      Tiêu đề khối lịch trình
                    </label>
                    <input
                      type="text"
                      className="input input-sm"
                      placeholder="Ví dụ: Lịch trình sự kiện (Agenda)"
                      value={block.title || ''}
                      onChange={(e) =>
                        onUpdateBlock(block.id, 'title', e.target.value)
                      }
                      disabled={saving}
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-xs">
                      <label className="text-xs font-semibold text-muted">
                        Các mốc thời gian trong lịch trình (
                        {block.items?.length || 0})
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs flex items-center gap-1"
                        onClick={() => onAddScheduleItem(block.id)}
                        disabled={saving}
                      >
                        <Icon name="plus" size="xs" ariaHidden />
                        <span>+ Thêm mốc thời gian</span>
                      </button>
                    </div>

                    {!block.items || block.items.length === 0 ? (
                      <div className="p-sm text-center border-dashed rounded text-xs text-muted bg-white dark:bg-slate-900">
                        Chưa có mốc thời gian nào. Bấm{' '}
                        <b>"+ Thêm mốc thời gian"</b> để thêm mốc giờ & mô tả.
                      </div>
                    ) : (
                      <div className="space-y-xs">
                        {block.items.map((it, itemIdx) => (
                          <div
                            key={it.id || itemIdx}
                            className="card p-sm border flex flex-col md:flex-row items-start md:items-center gap-sm bg-white dark:bg-slate-900"
                          >
                            <div
                              style={{ minWidth: '140px' }}
                              className="w-full md:w-auto"
                            >
                              <label className="text-xs font-medium text-muted mb-0.5 block">
                                Thời gian
                              </label>
                              <input
                                type="text"
                                className="input input-sm w-full font-mono font-semibold"
                                placeholder="08:30"
                                value={it.time || ''}
                                onChange={(e) =>
                                  onUpdateScheduleItem(
                                    block.id,
                                    it.id,
                                    'time',
                                    e.target.value
                                  )
                                }
                                disabled={saving}
                              />
                            </div>

                            <div className="flex-1 w-full">
                              <label className="text-xs font-medium text-muted mb-0.5 block">
                                Tiêu đề hoạt động
                              </label>
                              <input
                                type="text"
                                className="input input-sm w-full font-semibold"
                                placeholder="VD: Check-in & Đón khách"
                                value={it.title || ''}
                                onChange={(e) =>
                                  onUpdateScheduleItem(
                                    block.id,
                                    it.id,
                                    'title',
                                    e.target.value
                                  )
                                }
                                disabled={saving}
                              />
                            </div>

                            <div className="flex-1 w-full">
                              <label className="text-xs font-medium text-muted mb-0.5 block">
                                Mô tả chi tiết (Description)
                              </label>
                              <input
                                type="text"
                                className="input input-sm w-full"
                                placeholder="VD: Đón tiếp đại biểu, check-in mã vé QR và nhận tài liệu tham gia."
                                value={it.desc || it.description || ''}
                                onChange={(e) =>
                                  onUpdateScheduleItem(
                                    block.id,
                                    it.id,
                                    'desc',
                                    e.target.value
                                  )
                                }
                                disabled={saving}
                              />
                            </div>

                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-danger md:mt-3"
                              onClick={() =>
                                onRemoveScheduleItem(block.id, it.id)
                              }
                              disabled={saving}
                              title="Xóa mốc thời gian này"
                            >
                              <Icon name="trash" size="xs" ariaHidden />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Live Timeline Preview inside Form */}
                    {block.items && block.items.length > 0 && (
                      <div className="mt-md p-md rounded-lg border bg-white dark:bg-slate-900 shadow-sm">
                        <div className="text-xs font-semibold text-muted mb-xs flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-primary">
                            <Icon name="eye" size="xs" ariaHidden />
                            <b>
                              Xem trước hiển thị mốc thời gian (giao diện khách
                              xem):
                            </b>
                          </span>
                          <span className="badge badge-secondary text-xs">
                            Live Preview
                          </span>
                        </div>
                        <div
                          className="timeline-flow"
                          style={{ marginTop: '0.75rem' }}
                        >
                          {block.items.map((it, itemIdx) => (
                            <div
                              key={it.id || itemIdx}
                              className="timeline-item"
                            >
                              <div className="timeline-time-badge">
                                {it.time || '00:00'}
                              </div>
                              <div className="timeline-body">
                                <h4>{it.title || 'Tiêu đề mốc thời gian'}</h4>
                                {(it.desc || it.description) && (
                                  <p>{it.desc || it.description}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* BLOCK TYPE 3: MEDIA / IMAGE / SEAT MAP */}
              {(block.type === 'media' || block.type === 'image') && (
                <div className="space-y-sm">
                  <div className="form-group">
                    <label className="form-label text-xs font-semibold">
                      Tiêu đề ảnh / sơ đồ
                    </label>
                    <input
                      type="text"
                      className="input input-sm"
                      placeholder="Ví dụ: Sơ đồ chỗ ngồi, Sân khấu chính, Không gian sự kiện..."
                      value={block.title || ''}
                      onChange={(e) =>
                        onUpdateBlock(block.id, 'title', e.target.value)
                      }
                      disabled={saving}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label text-xs font-semibold">
                      Tải ảnh lên hoặc nhập URL
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-sm items-start">
                      <ImageUploader
                        id={`uploader-${block.id}`}
                        value={block.url || block.media_url || ''}
                        eventId={eventId}
                        mediaType="gallery"
                        aspect="wide"
                        onChange={(url) =>
                          onUpdateBlock(block.id, 'url', url)
                        }
                      />
                      <div className="space-y-xs">
                        <label className="text-xs text-muted block">
                          Hoặc dán trực tiếp đường dẫn hình ảnh:
                        </label>
                        <input
                          type="url"
                          className="input input-sm"
                          placeholder="https://example.com/photo.jpg hoặc /images/seat-map-theater.svg"
                          value={block.url || block.media_url || ''}
                          onChange={(e) =>
                            onUpdateBlock(block.id, 'url', e.target.value)
                          }
                          disabled={saving}
                        />
                        <label className="text-xs text-muted block mt-2">
                          Chú thích / Hướng dẫn đi kèm (Caption / Lưu ý):
                        </label>
                        <textarea
                          className="textarea text-xs"
                          rows={3}
                          placeholder="Ví dụ: Nguyên tắc Open Seating: Sự kiện áp dụng quy chế ngồi/đứng tự do theo khu vực hạng vé đã mua..."
                          value={block.caption || ''}
                          onChange={(e) =>
                            onUpdateBlock(block.id, 'caption', e.target.value)
                          }
                          disabled={saving}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Bottom Add Block Toolbar */}
          <div className="flex justify-center items-center gap-sm pt-md border-t flex-wrap">
            <span className="text-xs text-muted font-medium">
              Thêm đoạn nội dung khác:
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1"
              onClick={() => onAddBlock('paragraph')}
              disabled={saving}
            >
              <Icon name="plus" size="xs" ariaHidden />
              <span>+ Đoạn văn bản</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1"
              onClick={() => onAddBlock('schedule')}
              disabled={saving}
            >
              <Icon name="clock" size="xs" ariaHidden />
              <span>+ Đoạn lịch trình</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1"
              onClick={() => onAddBlock('media')}
              disabled={saving}
            >
              <Icon name="image" size="xs" ariaHidden />
              <span>+ Đoạn ảnh / Sơ đồ</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventBlocksSection;
