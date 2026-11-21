import React from 'react';
import { Icon } from '../../ui/Icon';

/**
 * Format currency amounts in Vietnamese Dong (VND)
 *
 * @param {number} amount
 * @returns {string} Formatted VND string
 */
const formatVND = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

/**
 * EventAnalyticsKpiCards Component
 *
 * Displays the 4 top-level KPI metrics for an individual event:
 * 1. Total Gross Revenue (GMV) & Average Order Value
 * 2. Total Purchases Count
 * 3. Ticket Sales Progress & Capacity Fill Rate
 * 4. Valid Registered Attendees & Active Ticket Tiers
 *
 * @param {Object} props
 * @param {number} props.totalRevenue - Total gross event sales in VND
 * @param {number} props.avgOrderValue - Average order value in VND
 * @param {number} props.totalPurchasesCount - Number of completed purchase transactions
 * @param {number} props.totalTicketsSold - Total quantity of sold tickets
 * @param {number} props.totalCapacity - Total capacity across all tiers
 * @param {number} props.soldPercent - Percentage of capacity sold (0-100)
 * @param {Array} props.attendees - Full attendee roster
 * @param {Array} props.tierList - Distinct ticket tiers
 */
export const EventAnalyticsKpiCards = ({
  totalRevenue = 0,
  avgOrderValue = 0,
  totalPurchasesCount = 0,
  totalTicketsSold = 0,
  totalCapacity = 100,
  soldPercent = 0,
  attendees = [],
  tierList = [],
}) => {
  const activeAttendeesCount = attendees.filter(
    (a) => a.status !== 'CANCELLED'
  ).length;

  return (
    <div className="kpi-grid">
      {/* 1. Gross Revenue (GMV) */}
      <article className="card kpi analytics-kpi-card revenue-card">
        <div
          className="kpi-icon-wrap"
          style={{ background: 'rgba(15, 118, 110, 0.1)', color: '#0f766e' }}
        >
          <Icon name="dollar" size="lg" ariaHidden />
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Tổng Doanh Thu (GMV)
        </span>
        <strong className="text-2xl text-primary font-bold">
          {formatVND(totalRevenue)}
        </strong>
        <div className="flex justify-between items-center text-xs mt-02 text-muted">
          <span>Giá trị đơn TB:</span>
          <span className="font-bold text-main">{formatVND(avgOrderValue)}</span>
        </div>
      </article>

      {/* 2. Total Purchases */}
      <article className="card kpi analytics-kpi-card orders-card">
        <div
          className="kpi-icon-wrap"
          style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}
        >
          <Icon name="cart" size="lg" ariaHidden />
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Số Lượt Mua Vé
        </span>
        <strong className="text-2xl text-main font-bold">
          {totalPurchasesCount} lượt mua
        </strong>
        <div className="flex justify-between items-center text-xs mt-02 text-muted">
          <span>Tình trạng:</span>
          <span className="font-bold note good">100% thanh toán trực tuyến</span>
        </div>
      </article>

      {/* 3. Ticket Sales & Capacity Fill Rate */}
      <article className="card kpi analytics-kpi-card tickets-card">
        <div
          className="kpi-icon-wrap"
          style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706' }}
        >
          <Icon name="ticket" size="lg" ariaHidden />
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Tiến Độ Phát Hành Vé
        </span>
        <strong className="text-2xl font-bold">
          {totalTicketsSold} / {totalCapacity} vé
        </strong>
        <div className="mt-02">
          <progress
            className="progress-bar-element w-full"
            value={soldPercent}
            max={100}
          />
        </div>
        <div className="flex justify-between text-xs mt-02 text-muted">
          <span className="font-bold note good">{soldPercent}% đã bán</span>
          <span>Còn lại: {Math.max(0, totalCapacity - totalTicketsSold)} vé</span>
        </div>
      </article>

      {/* 4. Attendees Count & Tier Breakdown */}
      <article className="card kpi analytics-kpi-card attendees-card">
        <div
          className="kpi-icon-wrap"
          style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}
        >
          <Icon name="users" size="lg" ariaHidden />
        </div>
        <span className="muted text-xs font-semibold uppercase tracking-wider">
          Khách Tham Dự Hợp Lệ
        </span>
        <strong className="text-2xl font-bold text-primary">
          {activeAttendeesCount} khách
        </strong>
        <div className="flex justify-between items-center text-xs mt-02 text-muted">
          <span>Cơ cấu vé:</span>
          <span className="font-bold text-main">
            {tierList.length} hạng vé mở bán
          </span>
        </div>
      </article>
    </div>
  );
};
