import React from 'react';
import { Icon } from '../../ui/Icon';

/**
 * EventCreationBarChart Component
 * Renders an SVG stacked bar chart visualizing monthly event creations,
 * segmented by live vs completed/draft status with an interactive hover tooltip.
 *
 * @param {Object} props
 * @param {Array} props.monthBuckets - Chronological aggregated month buckets
 * @param {number} props.barChartMax - Normalized Y-axis upper bound
 * @param {string|null} props.activeEventMonth - Currently hovered month key
 * @param {Function} props.setActiveEventMonth - State setter for hovered month
 */
export const EventCreationBarChart = ({
  monthBuckets = [],
  barChartMax = 10,
  activeEventMonth = null,
  setActiveEventMonth,
}) => {
  const totalEventsInPeriod = monthBuckets.reduce(
    (sum, b) => sum + (b.eventsTotal || 0),
    0
  );

  return (
    <article
      className="card chart-container-card"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
    >
      <div className="flex justify-between items-center mb-sm">
        <div>
          <h3 className="panel-title mb-0">1. Số Sự Kiện Theo Tháng</h3>
          <p className="muted text-xs mt-01 mb-0">
            Phân bố số lượng sự kiện tạo mới và tổ chức theo chu kỳ tháng
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs muted d-block">Tổng trong kỳ</span>
          <strong className="text-sm text-primary">
            {totalEventsInPeriod} sự kiện
          </strong>
        </div>
      </div>

      {/* Chart Legend */}
      <div className="flex items-center gap-md text-xs mb-sm chart-legend-row">
        <div className="legend-item">
          <span
            className="legend-color-dot"
            style={{ background: '#3b82f6' }}
          />
          <span>Đang mở bán (Live)</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color-dot"
            style={{ background: '#93c5fd' }}
          />
          <span>Hoàn thành / Bản nháp</span>
        </div>
      </div>

      {/* Responsive SVG Bar Chart */}
      <div className="svg-chart-wrapper">
        <svg
          viewBox="0 0 540 220"
          className="analytics-svg-chart"
          role="img"
          aria-label="Biểu đồ cột thống kê số sự kiện theo tháng"
        >
          <defs>
            <linearGradient id="barGradLive" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="barGradOther" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = 180 - pct * 150;
            const val = Math.round(barChartMax * pct);
            return (
              <g key={idx}>
                <line
                  x1="45"
                  y1={y}
                  x2="520"
                  y2={y}
                  stroke="var(--border-subtle, #e2e8f0)"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
                <text
                  x="38"
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="var(--text-muted, #64748b)"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Render Month Bars */}
          {monthBuckets.map((bucket, idx) => {
            const n = monthBuckets.length;
            const slotWidth = 460 / n;
            const barWidth = Math.min(36, slotWidth * 0.65);
            const x = 55 + idx * slotWidth + (slotWidth - barWidth) / 2;

            const totalHeight = (bucket.eventsTotal / barChartMax) * 150;
            const liveHeight = (bucket.eventsLive / barChartMax) * 150;
            const otherHeight = Math.max(0, totalHeight - liveHeight);

            const yTotal = 180 - totalHeight;
            const yLive = 180 - liveHeight;
            const yOther = yLive - otherHeight;

            const isHovered = activeEventMonth === bucket.key;

            return (
              <g
                key={bucket.key}
                className="chart-bar-group"
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${bucket.fullLabel}: ${bucket.eventsTotal} sự kiện`}
                onMouseEnter={() => setActiveEventMonth(bucket.key)}
                onMouseLeave={() => setActiveEventMonth(null)}
                onFocus={() => setActiveEventMonth(bucket.key)}
                onBlur={() => setActiveEventMonth(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Hover backplate column */}
                <rect
                  x={x - 4}
                  y="25"
                  width={barWidth + 8}
                  height="160"
                  fill={isHovered ? 'rgba(59, 130, 246, 0.08)' : 'transparent'}
                  rx="4"
                />

                {/* Other Events Bar Segment (Top) */}
                {otherHeight > 0 && (
                  <rect
                    x={x}
                    y={yOther}
                    width={barWidth}
                    height={otherHeight}
                    fill="url(#barGradOther)"
                    rx={liveHeight === 0 ? 4 : 0}
                    opacity={isHovered ? 1 : 0.85}
                  />
                )}

                {/* Live Events Bar Segment (Bottom) */}
                {liveHeight > 0 && (
                  <rect
                    x={x}
                    y={yLive}
                    width={barWidth}
                    height={liveHeight}
                    fill="url(#barGradLive)"
                    rx="4"
                    opacity={isHovered ? 1 : 0.9}
                  />
                )}

                {/* Event Count Label on top of bar */}
                {bucket.eventsTotal > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={Math.min(yTotal - 5, 170)}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="bold"
                    fill="var(--text-main, #0f172a)"
                  >
                    {bucket.eventsTotal}
                  </text>
                )}

                {/* X-axis Month Label */}
                <text
                  x={x + barWidth / 2}
                  y="200"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isHovered ? 'bold' : 'normal'}
                  fill={isHovered ? '#3b82f6' : 'var(--text-muted, #64748b)'}
                >
                  {bucket.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip for Event Month */}
        {activeEventMonth &&
          (() => {
            const b = monthBuckets.find(
              (item) => item.key === activeEventMonth
            );
            if (!b) return null;
            return (
              <div className="chart-tooltip active-tooltip">
                <div className="tooltip-date font-bold">{b.fullLabel}</div>
                <div className="tooltip-stat">
                  <span>Tổng số sự kiện:</span>
                  <strong className="text-primary">{b.eventsTotal}</strong>
                </div>
                <div className="tooltip-stat text-xs">
                  <span className="text-good inline-flex items-center gap-1">
                    <Icon
                      name="circle"
                      size="xs"
                      fill="currentColor"
                      ariaHidden
                    />{' '}
                    Đang mở bán:
                  </span>
                  <span>{b.eventsLive}</span>
                </div>
                <div className="tooltip-stat text-xs">
                  <span className="muted inline-flex items-center gap-1">
                    <Icon
                      name="circle"
                      size="xs"
                      fill="currentColor"
                      ariaHidden
                    />{' '}
                    Hoàn thành / Khác:
                  </span>
                  <span>{b.eventsCompleted}</span>
                </div>
              </div>
            );
          })()}
      </div>
    </article>
  );
};

export default EventCreationBarChart;
