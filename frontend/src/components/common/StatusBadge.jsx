import React from 'react';

/**
 * Standardized status badge across events, orders, tickets, attendees, and users.
 */
export const StatusBadge = ({ status, type = 'default' }) => {
  if (!status) return null;

  const raw = String(status).toUpperCase();

  // Role badges
  if (type === 'role' || ['ATTENDEE', 'ORGANIZER', 'ADMIN'].includes(raw)) {
    const roleColors = {
      ATTENDEE: 'badge-role-attendee',
      ORGANIZER: 'badge-role-organizer',
      ADMIN: 'badge-role-admin',
    };
    return <span className={`badge ${roleColors[raw] || 'badge-secondary'}`}>{raw}</span>;
  }

  // Event / Order / Ticket status mapping
  let badgeClass = 'badge-secondary';
  let label = raw;

  switch (raw) {
    case 'LIVE':
    case 'ACTIVE':
    case 'COMPLETED':
    case 'SUCCESS':
      badgeClass = 'badge-success';
      label = raw === 'LIVE' ? 'Đang mở bán' : raw === 'ACTIVE' ? 'Hợp lệ' : raw === 'COMPLETED' ? 'Hoàn tất' : 'Thành công';
      break;
    case 'DRAFT':
      badgeClass = 'badge-warning';
      label = 'Bản nháp';
      break;
    case 'PAUSED':
      badgeClass = 'badge-warning';
      label = 'Tạm dừng';
      break;
    case 'ENDED':
      badgeClass = 'badge-secondary';
      label = 'Đã kết thúc';
      break;
    case 'CANCELLED':
      badgeClass = 'badge-danger';
      label = 'Đã hủy';
      break;
    case 'CHECKED_IN':
      badgeClass = 'badge-info';
      label = 'Đã check-in';
      break;
    case 'TRANSFERRED':
      badgeClass = 'badge-warning';
      label = 'Đã chuyển nhượng';
      break;
    case 'RESERVED':
      badgeClass = 'badge-primary';
      label = 'Đang giữ chỗ';
      break;
    case 'PENDING_PAYMENT':
      badgeClass = 'badge-warning';
      label = 'Chờ thanh toán';
      break;
    case 'EXPIRED':
      badgeClass = 'badge-danger';
      label = 'Hết hạn';
      break;
    case 'REFUNDED':
      badgeClass = 'badge-info';
      label = 'Đã hoàn tiền';
      break;
    case 'SUSPENDED':
      badgeClass = 'badge-danger';
      label = 'Đã khóa';
      break;
    default:
      label = raw;
  }

  return <span className={`badge ${badgeClass}`}>{label}</span>;
};

export default StatusBadge;
