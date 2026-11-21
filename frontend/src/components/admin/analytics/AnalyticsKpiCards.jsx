import React from 'react';
import { Icon } from '../../ui/Icon';

/**
 * Format currency amounts in Vietnamese Dong (VND)
 *
 * @param {number} amount
 * @returns {string} Formatted currency string
 */
const formatVND = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

/**
 * AnalyticsKpiCards Component
 * Renders the top four high-level KPI summary cards for the Super Admin dashboard:
 * 1. Open events count and live percentage
 * 2. User reports & issue resolution rate
 * 3. Total registered platform accounts by role
 * 4. Gross merchandise value (GMV) and transaction volume
 *
 * @param {Object} props
 * @param {Object} props.openEventsStats - Computed stats for active events
 * @param {Object} props.userReportsStats - Computed stats for user reports
 * @param {Array} props.users - Full user accounts list
 * @param {Array} props.orders - Full orders list
 * @param {Object} props.stats - Aggregated stats from backend API
 * @param {Array} props.eventPurchasesList - Computed event purchases list
 */
export const AnalyticsKpiCards = ({
  openEventsStats = { openCount: 0, totalCount: 0, percent: 0 },
  userReportsStats = { totalReports: 0, resolvedReports: 0, pendingReports: 0 },
  users = [],
  orders = [],
  stats = {},
  eventPurchasesList = [],
}) => {
  const attendeeCount = users.filter((u) => u.role === 'ATTENDEE').length;
  const organizerCount = users.filter((u) => u.role === 'ORGANIZER').length;
  const adminCount = users.filter((u) => u.role === 'ADMIN').length;

  const totalGrossRevenue =
    stats?.gross_sales ||
    stats?.grossRevenue ||
    eventPurchasesList.reduce((acc, curr) => acc + (curr.revenue || 0), 0);

  return (
    <div className="kpi-grid">
      {/* 1. Open Events */}
      <article className="card kpi analytics-kpi-card">
        <div className="flex justify-between items-start mb-xs">
          <div
            className="kpi-icon-wrap"
            style={{
              background: 'rgba(6, 182, 212, 0.1)',
              color: '#0891b2',
              marginBottom: 0,
            }}
          >
            <Icon name="calendar" size="lg" ariaHidden />
          </div>
          <span className="badge badge-success text-xs">Đang mở bán</span>
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Sự Kiện Đang Mở
        </span>
        <div className="flex items-baseline gap-1.5 my-1">
          <strong className="text-2xl text-main font-bold font-mono">
            {openEventsStats.openCount}
          </strong>
          <span className="text-xs text-muted font-medium">sự kiện</span>
        </div>
        <div className="flex justify-between items-center text-xs pt-2 border-t text-muted mt-auto whitespace-nowrap">
          <span className="text-good font-semibold flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            {openEventsStats.percent}% tổng sự kiện
          </span>
          <span className="muted font-mono">
            {openEventsStats.openCount}/{openEventsStats.totalCount} sẵn sàng
          </span>
        </div>
      </article>

      {/* 2. User Reports & Inquiries */}
      <article className="card kpi analytics-kpi-card">
        <div className="flex justify-between items-start mb-xs">
          <div
            className="kpi-icon-wrap"
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              color: '#d97706',
              marginBottom: 0,
            }}
          >
            <Icon name="report" size="lg" ariaHidden />
          </div>
          <span className="badge badge-warning text-xs">Phản hồi & Khiếu nại</span>
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Báo Cáo Của Người Dùng
        </span>
        <div className="flex items-baseline gap-1.5 my-1">
          <strong className="text-2xl text-main font-bold font-mono">
            {userReportsStats.totalReports}
          </strong>
          <span className="text-xs text-muted font-medium">báo cáo</span>
        </div>
        <div className="flex justify-between items-center text-xs pt-2 border-t text-muted mt-auto whitespace-nowrap">
          <span className="text-good font-semibold flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            {userReportsStats.resolvedReports} đã xử lý
          </span>
          <span className="text-amber font-mono font-medium">
            {userReportsStats.pendingReports} chờ phản hồi
          </span>
        </div>
      </article>

      {/* 3. Platform Users Count */}
      <article className="card kpi analytics-kpi-card">
        <div className="flex justify-between items-start mb-xs">
          <div
            className="kpi-icon-wrap"
            style={{
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#8b5cf6',
              marginBottom: 0,
            }}
          >
            <Icon name="users" size="lg" ariaHidden />
          </div>
          <span className="badge badge-primary text-xs">All Users</span>
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Tổng Người Dùng Sàn
        </span>
        <div className="flex items-baseline gap-1.5 my-1">
          <strong className="text-2xl text-main font-bold font-mono">
            {users.length}
          </strong>
          <span className="text-xs text-muted font-medium">tài khoản</span>
        </div>
        <div className="flex items-center justify-between text-xs pt-2 border-t text-muted mt-auto whitespace-nowrap">
          <span className="text-teal font-semibold inline-flex items-center gap-1">
            <Icon name="circle" size="xs" fill="currentColor" ariaHidden />{' '}
            {attendeeCount} Khán giả
          </span>
          <span className="text-purple font-semibold inline-flex items-center gap-1">
            <Icon name="circle" size="xs" fill="currentColor" ariaHidden />{' '}
            {organizerCount} BTC
          </span>
          <span className="muted font-semibold inline-flex items-center gap-1">
            <Icon name="circle" size="xs" fill="currentColor" ariaHidden />{' '}
            {adminCount} Admin
          </span>
        </div>
      </article>

      {/* 4. Total Platform Gross Revenue */}
      <article className="card kpi analytics-kpi-card">
        <div className="flex justify-between items-start mb-xs">
          <div
            className="kpi-icon-wrap"
            style={{
              background: 'rgba(16, 185, 129, 0.1)',
              color: '#10b981',
              marginBottom: 0,
            }}
          >
            <Icon name="dollar" size="lg" ariaHidden />
          </div>
          <span className="badge badge-success text-xs">Gross GMV</span>
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Tổng Doanh Thu Sàn
        </span>
        <div className="flex items-baseline gap-1 my-1">
          <strong className="text-2xl text-primary font-bold font-mono">
            {formatVND(totalGrossRevenue)}
          </strong>
        </div>
        <div className="flex justify-between items-center text-xs pt-2 border-t text-muted mt-auto whitespace-nowrap">
          <span>
            Tổng đơn: <strong className="text-main font-mono">{orders.length}</strong>
          </span>
          <span className="muted font-mono">
            {stats?.platform_fee
              ? `Phí sàn: ${formatVND(stats.platform_fee)}`
              : 'Phí sàn 10%'}
          </span>
        </div>
      </article>
    </div>
  );
};

export default AnalyticsKpiCards;
