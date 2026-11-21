import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { Modal } from '../Modal';
import { ConfirmModal } from '../common/ConfirmModal';
import { Icon } from '../ui/Icon';

const formatSize = (bytes) => {
  if (!bytes || bytes <= 0) return '0 KB';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export const OrganizerAttachmentsTab = ({
  selectedEventId,
  events = [],
  onSelectEvent,
  notify,
  hideEventSelector = false,
}) => {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [uploadData, setUploadData] = useState({
    filename: '',
    description: '',
    file: null,
  });

  const loadAttachments = async (eventId) => {
    if (!eventId) return;
    setLoading(true);
    try {
      const res = await api.events.getAttachments(eventId);
      const list = Array.isArray(res) ? res : res?.attachments || [];
      setAttachments(list);
    } catch (err) {
      console.warn('Could not load attachments:', err.message);
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEventId) {
      loadAttachments(selectedEventId);
    }
  }, [selectedEventId]);

  const handleOpenUpload = () => {
    setUploadData({ filename: '', description: '', file: null });
    setShowUploadModal(true);
  };

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) {
      setUploadData((prev) => ({
        ...prev,
        file: f,
        filename: prev.filename || f.name,
      }));
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEventId || submitting) return;

    try {
      setSubmitting(true);
      let payload;
      if (uploadData.file) {
        const formData = new FormData();
        formData.append('file', uploadData.file);
        if (uploadData.filename) formData.append('filename', uploadData.filename);
        if (uploadData.description) formData.append('description', uploadData.description);
        payload = formData;
      } else {
        payload = {
          filename: uploadData.filename || 'document.pdf',
          description: uploadData.description || '',
          size: 102400,
        };
      }

      const res = await api.events.uploadAttachment(selectedEventId, payload);
      const created = res?.attachment || {
        id: `att-${Date.now()}`,
        filename: uploadData.filename || 'document.pdf',
        size: uploadData.file?.size || 0,
        uploaded_at: new Date().toISOString(),
      };

      notify(`Đã tải lên tài liệu "${created.filename}" thành công!`);
      setShowUploadModal(false);
      setUploadData({ filename: '', description: '', file: null });
      loadAttachments(selectedEventId);
    } catch (err) {
      notify(`Lỗi tải tài liệu: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEventId || !editingAttachment || submitting) return;

    try {
      setSubmitting(true);
      await api.events.updateAttachment(selectedEventId, editingAttachment.id, {
        filename: editingAttachment.filename,
        description: editingAttachment.description,
      });

      notify(`Đã cập nhật tài liệu "${editingAttachment.filename}"!`);
      setEditingAttachment(null);
      loadAttachments(selectedEventId);
    } catch (err) {
      notify(`Lỗi cập nhật: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !selectedEventId) return;
    try {
      await api.events.deleteAttachment(selectedEventId, deleteTarget.id);
      notify(`Đã xóa tài liệu "${deleteTarget.filename}"!`);
      setAttachments((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      notify(`Lỗi xóa tài liệu: ${err.message}`, 'error');
    }
  };

  return (
    <div className="stack">
      {/* Event Selector / Toolbar */}
      <div className="card toolbar flex items-center justify-between flex-wrap gap-sm">
        {!hideEventSelector && events.length > 0 ? (
          <div className="flex items-center gap-sm flex-1">
            <label htmlFor="attEvSelect" className="font-bold whitespace-nowrap">
              Chọn sự kiện:
            </label>
            <select
              id="attEvSelect"
              className="select max-w-400"
              value={selectedEventId || ''}
              onChange={(e) => onSelectEvent && onSelectEvent(e.target.value)}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  #{ev.id} - {ev.title} ({ev.status})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-xs">
            <Icon name="file" size="sm" className="text-primary" ariaHidden />
            <span className="font-bold text-foreground">Tài Liệu & Tệp Đính Kèm Sự Kiện</span>
            <span className="badge badge-primary">{attachments.length} tệp</span>
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary btn-sm flex items-center gap-1.5"
          onClick={handleOpenUpload}
          disabled={!selectedEventId}
        >
          <Icon name="plus" size="xs" ariaHidden />
          <span>Tải Lên Tài Liệu Mới</span>
        </button>
      </div>

      {/* Attachments Table */}
      {loading ? (
        <div className="card p-xl text-center text-muted">
          Đang tải danh sách tài liệu...
        </div>
      ) : attachments.length === 0 ? (
        <div className="card p-xl text-center empty-state">
          <div className="mb-sm">
            <Icon name="file" size="2xl" className="text-muted" ariaHidden />
          </div>
          <h3>Chưa có tài liệu đính kèm</h3>
          <p className="muted mb-md">
            Tải lên tài liệu PDF như: Hướng dẫn tham dự, Lịch trình chi tiết, Bản đồ địa điểm để gửi đến người mua vé.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenUpload}
            disabled={!selectedEventId}
          >
            Tải Lên Tệp Đầu Tiên
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>STT</th>
                  <th>Tên Tài Liệu</th>
                  <th style={{ width: '120px' }}>Kích thước</th>
                  <th style={{ width: '150px' }}>Ngày tải lên</th>
                  <th style={{ width: '180px' }} className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {attachments.map((att, idx) => (
                  <tr key={att.id || idx}>
                    <td className="text-muted text-xs font-mono">{idx + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Icon name="file" size="sm" className="text-primary flex-shrink-0" ariaHidden />
                        <div>
                          <div className="font-semibold text-sm text-foreground">
                            {att.filename || att.name || 'Tài liệu sự kiện'}
                          </div>
                          {att.description && (
                            <div className="text-xs muted line-clamp-1">{att.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-secondary font-mono text-xs">
                        {formatSize(att.size)}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs muted font-mono">
                        {formatDate(att.uploaded_at || att.created_at || new Date())}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {att.url && (
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-xs btn-outline inline-flex items-center gap-1"
                            title="Tải về hoặc xem tài liệu"
                          >
                            <Icon name="external-link" size="2xs" ariaHidden />
                            <span>Xem</span>
                          </a>
                        )}
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          onClick={() => setEditingAttachment({ ...att })}
                          title="Chỉnh sửa tên tài liệu"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-danger"
                          onClick={() => setDeleteTarget(att)}
                          title="Xóa tài liệu"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Attachment Modal */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => { if (!submitting) setShowUploadModal(false); }}
        title="Tải Lên Tài Liệu Đính Kèm (PDF)"
      >
        <form onSubmit={handleUploadSubmit} className="stack gap-sm">
          <div className="form-group mb-0">
            <label htmlFor="att-file-input" className="text-sm font-semibold required">
              Chọn tệp tệp PDF
            </label>
            <input
              id="att-file-input"
              type="file"
              accept=".pdf,application/pdf"
              className="input"
              onChange={handleFileChange}
              disabled={submitting}
            />
            <span className="text-xs muted mt-1 block">
              Hỗ trợ định dạng .PDF (Kích thước tối đa 10MB)
            </span>
          </div>

          <div className="form-group mb-0">
            <label htmlFor="att-filename-input" className="text-sm font-semibold required">
              Tên hiển thị tài liệu
            </label>
            <input
              id="att-filename-input"
              type="text"
              className="input"
              placeholder="VD: Lich-trinh-hoi-thao-2026.pdf"
              value={uploadData.filename}
              onChange={(e) => setUploadData({ ...uploadData, filename: e.target.value })}
              required
              disabled={submitting}
            />
          </div>

          <div className="form-group mb-0">
            <label htmlFor="att-desc-input" className="text-sm font-semibold">
              Mô tả ngắn (tùy chọn)
            </label>
            <input
              id="att-desc-input"
              type="text"
              className="input"
              placeholder="VD: Bản cập nhật lịch diễn và sơ đồ phân khu sự kiện"
              value={uploadData.description}
              onChange={(e) => setUploadData({ ...uploadData, description: e.target.value })}
              disabled={submitting}
            />
          </div>

          <div className="flex justify-end gap-sm mt-md">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowUploadModal(false)}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Đang tải lên...' : 'Tải Lên Tệp'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Attachment Modal */}
      <Modal
        isOpen={Boolean(editingAttachment)}
        onClose={() => { if (!submitting) setEditingAttachment(null); }}
        title="Chỉnh Sửa Thông Tin Tài Liệu"
      >
        {editingAttachment && (
          <form onSubmit={handleEditSubmit} className="stack gap-sm">
            <div className="form-group mb-0">
              <label htmlFor="edit-att-filename" className="text-sm font-semibold required">
                Tên hiển thị tài liệu
              </label>
              <input
                id="edit-att-filename"
                type="text"
                className="input"
                required
                placeholder="VD: Lich-trinh-hoi-thao-2026.pdf"
                value={editingAttachment.filename || ''}
                onChange={(e) => setEditingAttachment({ ...editingAttachment, filename: e.target.value })}
                disabled={submitting}
              />
            </div>

            <div className="form-group mb-0">
              <label htmlFor="edit-att-desc" className="text-sm font-semibold">
                Mô tả ngắn
              </label>
              <input
                id="edit-att-desc"
                type="text"
                className="input"
                placeholder="VD: Bản cập nhật lịch diễn và sơ đồ phân khu sự kiện"
                value={editingAttachment.description || ''}
                onChange={(e) => setEditingAttachment({ ...editingAttachment, description: e.target.value })}
                disabled={submitting}
              />
            </div>

            <div className="flex justify-end gap-sm mt-md">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditingAttachment(null)}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting ? 'Đang lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Xác nhận xóa tài liệu đính kèm"
        message={`Bạn có chắc chắn muốn xóa tài liệu "${deleteTarget?.filename}" khỏi sự kiện này không?`}
        isDanger={true}
      />
    </div>
  );
};

export default OrganizerAttachmentsTab;
