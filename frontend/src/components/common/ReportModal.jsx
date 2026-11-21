import React, { useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../Modal';
import { Icon } from '../ui/Icon';

export const ReportModal = ({
  isOpen,
  onClose,
  targetType = 'EVENT',
  targetId = null,
  targetTitle = '',
  onSuccess,
}) => {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [anonymousEmail, setAnonymousEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do báo cáo.');
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setError('Vui lòng nhập nội dung chi tiết (tối thiểu 5 ký tự).');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const payload = {
        target_type: targetType,
        target_id: targetId ? String(targetId) : null,
        target_title: targetTitle || 'Hệ thống',
        reason: reason.trim(),
        description: description.trim(),
        reporter_name: user?.name || 'Người dùng ẩn danh',
        reporter_email: user?.email || anonymousEmail || null,
      };

      const res = await api.reports.create(payload);
      setSuccessMsg(res?.message || 'Báo cáo đã được gửi thành công.');
      setTimeout(() => {
        setSuccessMsg(null);
        setReason('');
        setDescription('');
        setAnonymousEmail('');
        if (onSuccess) onSuccess(res?.report);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Không thể gửi báo cáo. Vui lòng thử lại sau.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setError(null);
    setSuccessMsg(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Gửi báo cáo">
      {successMsg ? (
        <div className="card p-md text-center" style={{ background: 'var(--bg-subtle, #f0fdf4)', border: '1px solid #86efac' }}>
          <div style={{ color: '#16a34a', marginBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
            <Icon name="check-circle" size="xl" color="#16a34a" ariaHidden />
          </div>
          <h3 className="text-sm font-bold text-success mb-xs">Gửi báo cáo thành công!</h3>
          <p className="text-xs muted m-0">{successMsg}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="stack gap-sm">
          {error && (
            <div className="alert alert-error text-xs p-xs">
              {error}
            </div>
          )}

          <div className="form-group">
            <label htmlFor="report-reason-input" className="form-label required text-xs font-semibold">
              Lý do báo cáo
            </label>
            <input
              id="report-reason-input"
              type="text"
              className="input w-full"
              placeholder="Nhập lý do báo cáo..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={submitting}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="report-desc-input" className="form-label required text-xs font-semibold">
              Nội dung chi tiết
            </label>
            <textarea
              id="report-desc-input"
              rows={4}
              className="textarea w-full"
              placeholder="Nhập nội dung chi tiết..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
              required
              minLength={5}
            />
          </div>

          {!user && (
            <div className="form-group">
              <label htmlFor="report-email-input" className="form-label text-xs">Email</label>
              <input
                id="report-email-input"
                type="email"
                className="input input-sm w-full"
                placeholder="Email"
                value={anonymousEmail}
                onChange={(e) => setAnonymousEmail(e.target.value)}
                disabled={submitting}
              />
            </div>
          )}

          <div className="flex justify-end gap-sm pt-xs border-t">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClose}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={submitting || !reason.trim() || !description.trim()}
            >
              {submitting ? 'Đang gửi...' : 'Gửi báo cáo'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

export default ReportModal;
