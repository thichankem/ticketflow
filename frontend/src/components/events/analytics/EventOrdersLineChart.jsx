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
 * EventOrdersLineChart Component
 *
 * Visualizes daily event order purchases through a smooth SVG area/line chart
 * with horizontal gridlines, peak highlight indicator, and responsive tooltips.
 *
 * @param {Object} props
 * @param {Array} props.linePoints - Calculated SVG coordinate points for timeline
 * @param {string} props.linePathD - SVG path definition for smooth bezier curve
 * @param {string} props.areaPathD - SVG path definition for gradient area under curve
 * @param {number} props.maxDailyOrders - Maximum order volume for Y-axis scaling
 * @param {Object|null} props.peakOrdersDay - Day bucket with maximum transactions
 * @param {Object|null} props.activeLinePoint - Currently hovered point
 * @param {Function} props.setActiveLinePoint - Setter for hovered point
 * @param {Function} props.getTooltipStyle - Smart positioning style calculator for tooltip
 */
export const EventOrdersLineChart = ({
  linePoints = [],
  linePathD = '',
  areaPathD = '',
  maxDailyOrders = 5,
  peakOrdersDay = null,
  activeLinePoint = null,
  setActiveLinePoint,
  getTooltipStyle,
}) => {
  const svgWidth = 760;
  const svgHeight = 240;
  const padLeft = 55;
  const padRight = 45;
  const padTop = 35;
  const padBottom = 40;
  const graphHeight = svgHeight - padTop - padBottom;

  return (
    <section className="card chart-container-card">
      <div className="chart-header flex justify-between items-start mb-md">
        <div>
          <h2 className="panel-title m-0 flex items-center gap-1.5 text-base">
            <Icon
              name="trending-up"
              size="sm"
              ariaHidden
              className="text-primary"
            />
            <span>Số Lượt Mua Theo Thời Gian (Theo Ngày)</span>
          </h2>
          <p className="muted text-xs mt-01 mb-0">
            Biểu diễn số lượng giao dịch và lượt mua vé phát sinh theo từng mốc thời gian ngày
          </p>
        </div>

        {peakOrdersDay && (
          <div className="chart-peak-pill text-right">
            <span className="muted text-xs">Cao điểm: </span>
            <strong className="text-primary font-bold">
              {peakOrdersDay.displayDate}
            </strong>
            <span className="text-xs ml-xs font-semibold">
              ({peakOrdersDay.ordersCount} lượt mua)
            </span>
          </div>
        )}
      </div>

      {/* SVG Line Chart View */}
      <div className="svg-chart-wrapper">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="analytics-svg-chart"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="ordersAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--primary, #0d9488)"
                stopOpacity="0.32"
              />
              <stop
                offset="100%"
                stopColor="var(--primary, #0d9488)"
                stopOpacity="0.0"
              />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-axis scale */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = padTop + graphHeight * (1 - pct);
            const val = Math.round(maxDailyOrders * pct);
            return (
              <g key={`y-grid-${idx}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="var(--border-default, #e2e8f0)"
                  strokeDasharray={pct === 0 ? 'none' : '3,3'}
                  strokeWidth={pct === 0 ? '1.5' : '1'}
                  opacity={0.65}
                />
                <text
                  x={padLeft - 10}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--text-faint, #94a3b8)"
                  fontFamily="sans-serif"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          {areaPathD && (
            <path d={areaPathD} fill="url(#ordersAreaGradient)" />
          )}

          {/* Main Smooth Line */}
          {linePathD && (
            <path
              d={linePathD}
              fill="none"
              stroke="var(--primary, #0d9488)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points (Circles) */}
          {linePoints.map((pt, idx) => (
            <g key={`pt-${idx}`}>
              <circle
                cx={pt.x}
                cy={pt.y}
                r={activeLinePoint?.data.dateKey === pt.data.dateKey ? 7 : 4.5}
                fill="var(--bg-surface, #ffffff)"
                stroke="var(--primary, #0d9488)"
                strokeWidth="3"
                className="chart-circle-point"
                onMouseEnter={() => setActiveLinePoint(pt)}
                onMouseLeave={() => setActiveLinePoint(null)}
              />

              {/* X-axis date labels */}
              {(linePoints.length <= 14 ||
                idx % 2 === 0 ||
                idx === linePoints.length - 1) && (
                <text
                  x={pt.x}
                  y={svgHeight - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill={
                    activeLinePoint?.data.dateKey === pt.data.dateKey
                      ? 'var(--primary)'
                      : 'var(--text-muted)'
                  }
                  fontFamily="sans-serif"
                >
                  {pt.data.displayDate}
                </text>
              )}
            </g>
          ))}
        </svg>

        {/* Interactive Line Chart Tooltip */}
        {activeLinePoint && (
          <div
            className="chart-tooltip"
            style={getTooltipStyle(activeLinePoint)}
          >
            <div className="tooltip-date font-bold">
              {activeLinePoint.data.fullDate}
            </div>
            <div className="tooltip-stat">
              <span>Số lượt mua:</span>
              <strong className="text-primary">
                {activeLinePoint.data.ordersCount} lượt
              </strong>
            </div>
            <div className="tooltip-stat">
              <span>Doanh thu ngày:</span>
              <strong>{formatVND(activeLinePoint.data.revenue)}</strong>
            </div>
            <div className="tooltip-stat text-xs muted">
              <span>Vé bán ra:</span>
              <span>{activeLinePoint.data.totalTickets} vé</span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
