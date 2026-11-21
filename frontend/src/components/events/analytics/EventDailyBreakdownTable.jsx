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
 * EventDailyBreakdownTable Component
 *
 * Displays a tabular daily breakdown of ticket sales performance:
 * - Date and formatted calendar label
 * - Number of purchases
 * - Distribution breakdown across active ticket tiers
 * - Total tickets issued
 * - Daily gross revenue
 *
 * @param {Object} props
 * @param {Array} props.analyticsData - Aggregated daily statistics timeline
 * @param {Array} props.tierList - Configured ticket tiers with styling metadata
 * @param {string} props.timeRange - Selected filter range ('7' | '14' | '30' | 'all')
 * @param {number} props.totalPurchasesCount - Aggregated purchases total
 * @param {number} props.totalTicketsSold - Aggregated tickets sold
 * @param {number} props.totalRevenue - Aggregated total revenue
 */
export const EventDailyBreakdownTable = ({
  analyticsData = [],
  tierList = [],
  timeRange = '7',
  totalPurchasesCount = 0,
  totalTicketsSold = 0,
  totalRevenue = 0,
}) => {
  const visibleRows = analyticsData
    .filter((d) => d.ordersCount > 0 || d.totalTickets > 0 || timeRange === '7')
    .slice(-14);

  return (
    <section className="card">
      <div className="toolbar toolbar-row-flex mb-md">
        <div>
          <h2 className="panel-title m-0 flex items-center gap-1.5 text-base">
            <Icon name="table" size="sm" ariaHidden className="text-primary" />
            <span>Bảng Thống Kê Chi Tiết Số Liệu Theo Ngày</span>
          </h2>
          <p className="muted text-xs m-0">
            Bảng tra cứu số lượt mua, doanh thu và số lượng từng loại vé phát hành theo từng ngày
          </p>
        </div>
        <span className="badge badge-primary font-mono text-xs">
          {analyticsData.length} ngày tổng hợp
        </span>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Ngày</th>
              <th className="text-center">Số Lượt Mua</th>
              <th>Phân Bổ Theo Hạng Vé</th>
              <th className="text-center">Tổng Vé Bán</th>
              <th className="text-right">Doanh Thu Ngày</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.dateKey}
                className={row.ordersCount > 0 ? 'bg-active-row' : ''}
              >
                <td>
                  <strong>{row.fullDate}</strong>
                  <span className="muted text-xs ml-xs">
                    ({row.displayDate})
                  </span>
                </td>
                <td className="text-center">
                  <span
                    className={`badge ${
                      row.ordersCount > 0 ? 'badge-primary' : 'badge-neutral'
                    }`}
                  >
                    {row.ordersCount} lượt
                  </span>
                </td>
                <td>
                  <div className="flex flex-wrap gap-xs">
                    {tierList.map((tr) => {
                      const qty = row.tierCounts[tr.name] || 0;
                      if (qty === 0) return null;
                      return (
                        <span
                          key={tr.id}
                          className="tier-pill-badge"
                          style={{
                            background: `${tr.color}15`,
                            color: tr.color,
                            border: `1px solid ${tr.color}40`,
                          }}
                        >
                          {tr.name}: <strong>{qty}</strong>
                        </span>
                      );
                    })}
                    {Object.values(row.tierCounts).every((q) => q === 0) && (
                      <span className="muted text-xs">0 vé</span>
                    )}
                  </div>
                </td>
                <td className="text-center font-bold">
                  {row.totalTickets > 0 ? (
                    <span className="text-primary">{row.totalTickets} vé</span>
                  ) : (
                    <span className="muted">0</span>
                  )}
                </td>
                <td className="text-right font-bold note good">
                  {formatVND(row.revenue)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold bg-muted-row">
              <td>TỔNG CỘNG THEO KỲ CHỌN</td>
              <td className="text-center text-primary">
                {totalPurchasesCount} lượt mua
              </td>
              <td>
                <span className="text-xs muted">
                  {tierList.length} hạng vé đang hoạt động
                </span>
              </td>
              <td className="text-center text-primary">
                {totalTicketsSold} vé
              </td>
              <td className="text-right text-primary text-base">
                {formatVND(totalRevenue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
};
