import React, { useState, useMemo } from 'react';
import { api } from '../../services/api';
import { formatDate } from '../../utils/display';
import { Modal } from '../Modal';
import { Icon } from '../ui/Icon';

export const AdminReportsTab = ({
  reports = [],
  loading = false,
  onUpdateReport,
  onReload,
  notify,
}) => {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  // Resolution modal state
  const [resolvingReport, setResolvingReport] = useState(null);
  const [newStatus, setNewStatus] = useState('RESOLVED');
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Status badge helper
  const renderReportStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span className="badge badge-warning">Chờ xử lý</span>;
      case 'INVESTIGATING':
        return <span className="badge badge-info">Đang xác minh</span>;
      case 'RESOLVED':
        return <span className="badge badge-success">Đã giải quyết</span>;
      case 'DISMISSED':
        return <span className="badge badge-secondary">Đã bác bỏ</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const renderReasonLabel = (reason) => {
    switch (reason) {
      case 'FRAUD':
        return 'Lừa đảo / Giả mạo';
      case 'MISLEADING':
        return 'Thông tin sai lệch';
      case 'INAPPROPRIATE':
        return 'Nội dung phản cảm';
      case 'COPYRIGHT':
        return 'Bản quyền';
      case 'POLICY_VIOLATION':
        return 'Vi phạm chính sách';
      case 'TECHNICAL':
        return 'Sự cố kỹ thuật';
      case 'HARASSMENT':
        return 'Gây rối / Quấy rối';
      case 'SPAM':
        return 'Spam vé';
      case 'PAYMENT':
        return 'Khiếu nại thanh toán';
      default:
        return reason || 'Khác';
    }
  };

  // Metrics
  const stats = useMemo(() => {
    return {
      total: reports.length,
      pending: reports.filter((r) => r.status === 'PENDING').length,
      investigating: reports.filter((r) => r.status === 'INVESTIGATING').length,
      resolved: reports.filter((r) => r.status === 'RESOLVED').length,
      dismissed: reports.filter((r) => r.status === 'DISMISSED').length,
    };
  }, [reports]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        (r.target_title || '').toLowerCase().includes(q) ||
        (r.reporter_name || '').toLowerCase().includes(q) ||
        (r.reporter_email || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        String(r.id).includes(q);

      const matchesStatus =
        statusFilter === 'ALL' || (r.status || 'PENDING').toUpperCase() === statusFilter.toUpperCase();

      const matchesRole =
        roleFilter === 'ALL' || (r.reporter_role || 'ATTENDEE').toUpperCase() === roleFilter.toUpperCase();

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [reports, search, statusFilter, roleFilter]);

  const handleOpenResolve = (rep) => {
    setResolvingReport(rep);
    setNewStatus(rep.status === 'PENDING' ? 'RESOLVED' : rep.status);
    setAdminNotes(rep.admin_notes || '');
  };

  const handleConfirmResolve = async (e) => {
    e.preventDefault();
    if (!resolvingReport || submitting) return;

    try {
      setSubmitting(true);
      await onUpdateReport(resolvingReport.id, {
        status: newStatus,
        admin_notes: adminNotes.trim(),
      });
      notify(`Đã cập nhật trạng thái báo cáo #${resolvingReport.id} thành công!`);
      setResolvingReport(null);
    } catch (err) {
      notify(`Lỗi cập nhật báo cáo: ${err.message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="stack" role="tabpanel" id="admin-reports-panel">
      {/* Metrics Row */}
      <div className="grid grid-4 gap-md mb-md">
        <div className="card stat-card p-md">
          <div className="flex justify-between items-center mb-xs">
            <span className="text-xs muted font-semibold">Tổng Báo Cáo</span>
            <Icon name="shield" size="xs" className="text-primary" ariaHidden />
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <span className="text-2xs muted mt-1">Từ Khán giả & Ban tổ chức</span>
        </div>

        <div className="card stat-card p-md">
          <div className="flex justify-between items-center mb-xs">
            <span className="text-xs muted font-semibold">Chờ Xử Lý</span>
            <span className="badge badge-warning text-xs">Mới</span>
          </div>
          <div className="text-2xl font-bold text-warning">{stats.pending}</div>
          <span className="text-2xs muted mt-1">Cần Admin thẩm định</span>
        </div>

        <div className="card stat-card p-md">
          <div className="flex justify-between items-center mb-xs">
            <span className="text-xs muted font-semibold">Đang Xác Minh</span>
            <span className="badge badge-info text-xs">Tiến trình</span>
          </div>
          <div className="text-2xl font-bold text-info">{stats.investigating}</div>
          <span className="text-2xs muted mt-1">Đang liên hệ các bên</span>
        </div>

        <div className="card stat-card p-md">
          <div className="flex justify-between items-center mb-xs">
            <span className="text-xs muted font-semibold">Đã Giải Quyết</span>
            <span className="badge badge-success text-xs">Hoàn tất</span>
          </div>
          <div className="text-2xl font-bold text-success">{stats.resolved}</div>
          <span className="text-2xs muted mt-1">Đã xử lý hoặc chế tài</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card p-md mb-md flex justify-between items-center flex-wrap gap-md">
        <div className="flex items-center gap-xs flex-wrap">
          <button
            type="button"
            className={`btn btn-xs ${statusFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('ALL')}
          >
            Tất cả ({stats.total})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${statusFilter === 'PENDING' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('PENDING')}
          >
            Chờ xử lý ({stats.pending})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${statusFilter === 'INVESTIGATING' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('INVESTIGATING')}
          >
            Đang xác minh ({stats.investigating})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${statusFilter === 'RESOLVED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('RESOLVED')}
          >
            Đã giải quyết ({stats.resolved})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${statusFilter === 'DISMISSED' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setStatusFilter('DISMISSED')}
          >
            Đã bác bỏ ({stats.dismissed})
          </button>
        </div>

        <div className="flex items-center gap-sm flex-wrap">
          <select
            className="select select-sm text-xs"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Lọc theo người gửi"
          >
            <option value="ALL">Mọi người gửi</option>
            <option value="ATTENDEE">Từ Khách mua vé (Attendee)</option>
            <option value="ORGANIZER">Từ Ban tổ chức (Organizer)</option>
          </select>

          <input
            type="search"
            className="input input-sm text-xs"
            placeholder="Tìm theo sự kiện, người gửi, nội dung..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ minWidth: '220px' }}
          />

          <button
            type="button"
            className="btn btn-secondary btn-sm flex items-center gap-1"
            onClick={onReload}
            title="Tải lại danh sách"
          >
            <Icon name="refresh" size="xs" ariaHidden />
            <span>Tải lại</span>
          </button>
        </div>
      </div>

      {/* Reports Table */}
      {loading ? (
        <div className="card loading-state p-xl text-center text-muted">
          Đang tải danh sách báo cáo vi phạm...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="card empty-state p-xl text-center">
          <div className="empty-icon text-muted mb-sm">
            <Icon name="shield" size="xl" ariaHidden />
          </div>
          <h3>Không tìm thấy báo cáo nào</h3>
          <p className="muted text-sm m-0">
            {search || statusFilter !== 'ALL' || roleFilter !== 'ALL'
              ? 'Không có báo cáo nào khớp với bộ lọc hiện tại.'
              : 'Hiện không có báo cáo vi phạm nào đang chờ xử lý trên sàn.'}
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden" style={{ overflowX: 'auto' }}>
          <table className="table w-full">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>ID</th>
                <th>Người Báo Cáo</th>
                <th>Đối Tượng Vi Phạm</th>
                <th>Lý Do</th>
                <th>Nội Dung Phản Ánh</th>
                <th>Trạng Thái</th>
                <th>Thời Gian</th>
                <th style={{ textAlign: 'right', minWidth: '110px' }}>Hành Động</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((rep) => (
                <tr key={rep.id} style={{ background: rep.status === 'PENDING' ? 'rgba(234, 179, 8, 0.04)' : undefined }}>
                  <td className="font-mono text-xs font-bold">#{rep.id}</td>
                  <td>
                    <div className="text-xs font-semibold text-foreground">
                      {rep.reporter_name || 'Khách ẩn danh'}
                    </div>
                    {rep.reporter_email && (
                      <div className="text-2xs muted">{rep.reporter_email}</div>
                    )}
                    <span
                      className={`badge text-2xs mt-1 ${
                        rep.reporter_role === 'ORGANIZER' ? 'badge-primary' : 'badge-secondary'
                      }`}
                    >
                      {rep.reporter_role === 'ORGANIZER' ? 'Ban Tổ Chức' : 'Khách Mua Vé'}
                    </span>
                  </td>
                  <td>
                    <div className="text-xs font-semibold text-foreground" style={{ maxWidth: '200px' }}>
                      <span className="badge badge-outline text-2xs mr-1">
                        {rep.target_type === 'EVENT' ? 'Sự kiện' : rep.target_type === 'ATTENDEE' ? 'Khách' : 'Hệ thống'}
                      </span>
                      {rep.target_title || `#${rep.target_id || ''}`}
                    </div>
                    {rep.target_id && (
                      <div className="text-2xs muted mt-05">Mã mục tiêu: #{rep.target_id}</div>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-warning text-2xs font-semibold">
                      {renderReasonLabel(rep.reason)}
                    </span>
                  </td>
                  <td style={{ maxWidth: '280px' }}>
                    <p className="text-xs text-foreground line-clamp-2 m-0" title={rep.description}>
                      {rep.description}
                    </p>
                    {rep.admin_notes && (
                      <p className="text-2xs text-info mt-1 m-0 bg-subtle p-1 rounded" title={rep.admin_notes}>
                        <strong>Ghi chú Admin:</strong> {rep.admin_notes}
                      </p>
                    )}
                  </td>
                  <td>{renderReportStatusBadge(rep.status)}</td>
                  <td className="text-2xs muted whitespace-nowrap">
                    {formatDate(rep.created_at)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-xs btn-primary inline-flex items-center gap-1"
                      onClick={() => handleOpenResolve(rep)}
                    >
                      <Icon name="edit" size="xs" ariaHidden />
                      <span>Xử lý</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Admin Report Resolution Modal */}
      <Modal
        isOpen={Boolean(resolvingReport)}
        onClose={() => { if (!submitting) setResolvingReport(null); }}
        title={`Xử Lý Báo Cáo Vi Phạm #${resolvingReport?.id || ''}`}
      >
        {resolvingReport && (
          <form onSubmit={handleConfirmResolve} className="stack">
            <div className="card p-sm bg-subtle mb-xs text-xs">
              <div className="flex justify-between items-center mb-1">
                <span>
                  <strong>Người gửi:</strong> {resolvingReport.reporter_name} (
                  {resolvingReport.reporter_role === 'ORGANIZER' ? 'Ban Tổ Chức' : 'Khách Mua Vé'})
                </span>
                <span className="muted">{formatDate(resolvingReport.created_at)}</span>
              </div>
              <div className="mb-1">
                <strong>Đối tượng:</strong> [{resolvingReport.target_type}] {resolvingReport.target_title}
              </div>
              <div>
                <strong>Lý do:</strong> {renderReasonLabel(resolvingReport.reason)}
              </div>
              <div className="mt-2 p-2 rounded bg-card border text-foreground">
                <em>"{resolvingReport.description}"</em>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="resolve-status-select" className="form-label required text-xs font-semibold">
                Cập nhật trạng thái xử lý
              </label>
              <select
                id="resolve-status-select"
                className="select w-full"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                disabled={submitting}
                required
              >
                <option value="INVESTIGATING">Đang xác minh (INVESTIGATING)</option>
                <option value="RESOLVED">Đã giải quyết / Xác nhận vi phạm (RESOLVED)</option>
                <option value="DISMISSED">Bác bỏ / Không vi phạm (DISMISSED)</option>
                <option value="PENDING">Chờ xử lý (PENDING)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="resolve-notes-input" className="form-label text-xs font-semibold">
                Ghi chú thẩm định & Hành động của Quản trị viên
              </label>
              <textarea
                id="resolve-notes-input"
                rows={3}
                className="textarea w-full text-xs"
                placeholder="Ghi nhận hướng giải quyết, chế tài áp dụng hoặc lý do bác bỏ khiếu nại..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex justify-end gap-sm mt-md pt-sm border-t">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setResolvingReport(null)}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm flex items-center gap-1.5"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      className="spinner-sm"
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: '0.85rem',
                        height: '0.85rem',
                        border: '2px solid currentColor',
                        borderRightColor: 'transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.75s linear infinite',
                      }}
                    />
                    <span>Đang cập nhật...</span>
                  </>
                ) : (
                  <>
                    <Icon name="check" size="xs" ariaHidden />
                    <span>Lưu Kết Quả Xử Lý</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default AdminReportsTab;
