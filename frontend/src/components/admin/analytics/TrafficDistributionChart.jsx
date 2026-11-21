import React from 'react';
import { Icon } from '../../ui/Icon';

/**
 * TrafficDistributionChart Component
 * Visualizes active online traffic across 24 hourly time slots or daily granularities,
 * highlighting peak times, current active slot, and attendee/organizer breakdown.
 *
 * @param {Object} props
 * @param {Array} props.sortedTrafficBuckets - Time buckets sorted according to user selection
 * @param {number} props.trafficChartMax - Maximum Y value for chart scale
 * @param {Object} props.liveOnlineStats - Summary metrics for live online users
 * @param {string} props.trafficGranularity - 'hourly' | 'daily7' | 'daily30'
 * @param {Function} props.setTrafficGranularity - Granularity state setter
 * @param {string} props.trafficSortBy - Current sort option value
 * @param {Function} props.setTrafficSortBy - Sort option state setter
 * @param {string|null} props.activeTrafficSlot - Currently hovered bucket key
 * @param {Function} props.setActiveTrafficSlot - State setter for hovered bucket
 */
export const TrafficDistributionChart = ({
  sortedTrafficBuckets = [],
  trafficChartMax = 10,
  liveOnlineStats = { total: 0 },
  trafficGranularity = 'hourly',
  setTrafficGranularity,
  trafficSortBy = 'time-asc',
  setTrafficSortBy,
  activeTrafficSlot = null,
  setActiveTrafficSlot,
}) => {
  return (
    <article
      className="card chart-container-card"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 340px' }}
    >
      <div className="flex justify-between items-center flex-wrap gap-sm mb-sm">
        <div>
          <h3 className="panel-title mb-0">
            3. Người Dùng Trực Tuyến & Phân Bổ Lưu Lượng
          </h3>
          <p className="muted text-xs mt-01 mb-0">
            Thống kê lưu lượng truy cập và người dùng trực tuyến theo khung giờ hoặc ngày
          </p>
        </div>

        {/* View Granularity & Sort Controls */}
        <div className="flex items-center gap-sm flex-wrap">
          <span className="badge badge-success text-xs font-semibold inline-flex items-center gap-1">
            <Icon name="circle" size="xs" fill="currentColor" ariaHidden />
            <span>{liveOnlineStats.total} đang online</span>
          </span>

          <div
            className="filter-pills"
            role="group"
            aria-label="Xem theo giờ hoặc ngày"
          >
            <button
              type="button"
              className={`filter-pill ${
                trafficGranularity === 'hourly' ? 'active' : ''
              }`}
              onClick={() => setTrafficGranularity('hourly')}
              title="Xem theo 24 giờ trong ngày"
            >
              24 Giờ
            </button>
            <button
              type="button"
              className={`filter-pill ${
                trafficGranularity === 'daily7' ? 'active' : ''
              }`}
              onClick={() => setTrafficGranularity('daily7')}
              title="Xem theo 7 ngày gần nhất"
            >
              7 Ngày
            </button>
            <button
              type="button"
              className={`filter-pill ${
                trafficGranularity === 'daily30' ? 'active' : ''
              }`}
              onClick={() => setTrafficGranularity('daily30')}
              title="Xem theo 30 ngày gần nhất"
            >
              30 Ngày
            </button>
          </div>

          <div className="flex items-center gap-xs">
            <span className="text-xs muted font-semibold">Sắp xếp:</span>
            <select
              className="select select-compact text-xs"
              style={{ width: '150px', height: '28px' }}
              value={trafficSortBy}
              onChange={(e) => setTrafficSortBy(e.target.value)}
              aria-label="Sắp xếp dữ liệu lưu lượng người dùng"
            >
              <option value="time-asc">Thời gian: Tăng dần</option>
              <option value="time-desc">Thời gian: Giảm dần</option>
              <option value="volume-desc">Số lượng cao nhất</option>
              <option value="volume-asc">Số lượng thấp nhất</option>
            </select>
          </div>
        </div>
      </div>

      {/* SVG Wave & Column Chart */}
      <div className="svg-chart-wrapper relative">
        <svg
          viewBox="0 0 940 220"
          className="analytics-svg-chart"
          role="img"
          aria-label={`Biểu đồ người dùng online và lưu lượng hoạt động ${
            trafficGranularity === 'hourly' ? 'theo 24 giờ' : 'theo ngày'
          }`}
        >
          <defs>
            <linearGradient id="trafficAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="trafficBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient
              id="trafficBarCurrentGrad"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#10b981" stopOpacity="1" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.8" />
            </linearGradient>
          </defs>

          {/* Horizontal Baseline & Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = 175 - ratio * 145;
            const countVal = Math.round(trafficChartMax * ratio);
            return (
              <g key={ratio}>
                <line
                  x1="45"
                  y1={y}
                  x2="915"
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
                  {countVal}
                </text>
              </g>
            );
          })}

          {/* Render Traffic Bars */}
          {sortedTrafficBuckets.map((b, idx) => {
            const n = sortedTrafficBuckets.length;
            const slotWidth = 860 / n;
            const barWidth = Math.min(26, slotWidth * 0.72);
            const x = 50 + idx * slotWidth + (slotWidth - barWidth) / 2;
            const cx = x + barWidth / 2;

            const height = (b.count / trafficChartMax) * 145;
            const y = 175 - height;
            const isHovered = activeTrafficSlot === b.key;

            return (
              <g
                key={b.key}
                className="chart-bar-group"
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${b.fullLabel}: ${b.count} người dùng`}
                onMouseEnter={() => setActiveTrafficSlot(b.key)}
                onMouseLeave={() => setActiveTrafficSlot(null)}
                onFocus={() => setActiveTrafficSlot(b.key)}
                onBlur={() => setActiveTrafficSlot(null)}
                style={{ cursor: 'pointer' }}
              >
                {/* Hover backplate */}
                <rect
                  x={x - 2}
                  y="25"
                  width={barWidth + 4}
                  height="155"
                  fill={
                    isHovered
                      ? 'rgba(6, 182, 212, 0.12)'
                      : b.isCurrent
                      ? 'rgba(16, 185, 129, 0.08)'
                      : 'transparent'
                  }
                  rx="4"
                />

                {/* Vertical Column Bar */}
                {height > 0 && (
                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={height}
                    fill={
                      b.isCurrent
                        ? 'url(#trafficBarCurrentGrad)'
                        : isHovered
                        ? '#0891b2'
                        : 'url(#trafficBarGrad)'
                    }
                    rx="3"
                    opacity={isHovered ? 1 : 0.88}
                  />
                )}

                {/* Peak Indicator Dot */}
                {b.isPeak && (
                  <circle
                    cx={cx}
                    cy={Math.max(y - 8, 20)}
                    r="3.5"
                    fill="#f59e0b"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                )}

                {/* Count Label */}
                {b.count > 0 && (
                  <text
                    x={cx}
                    y={Math.min(y - 4, 168)}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill={
                      b.isCurrent ? '#059669' : 'var(--text-main, #0f172a)'
                    }
                    fontFamily="monospace"
                  >
                    {b.count}
                  </text>
                )}

                {/* X-axis Label */}
                {(n <= 14 || idx % 2 === 0 || isHovered) && (
                  <text
                    x={cx}
                    y="195"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight={isHovered || b.isCurrent ? 'bold' : 'normal'}
                    fill={
                      b.isCurrent
                        ? '#10b981'
                        : isHovered
                        ? '#0891b2'
                        : 'var(--text-muted, #64748b)'
                    }
                  >
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {activeTrafficSlot &&
          (() => {
            const slot = sortedTrafficBuckets.find(
              (s) => s.key === activeTrafficSlot
            );
            if (!slot) return null;
            return (
              <div
                className="chart-tooltip active-tooltip"
                style={{ left: '50%', top: '25%' }}
              >
                <div className="tooltip-date font-bold flex items-center justify-between gap-2">
                  <span>{slot.fullLabel}</span>
                  {slot.isCurrent && (
                    <span className="badge badge-success text-2xs">
                      Hiện tại
                    </span>
                  )}
                  {slot.isPeak && (
                    <span className="badge badge-warning text-2xs">
                      Giờ cao điểm
                    </span>
                  )}
                </div>
                <div className="tooltip-stat">
                  <span>Người dùng hoạt động:</span>
                  <strong className="text-cyan-600 dark:text-cyan-400 font-bold">
                    {slot.count} tài khoản
                  </strong>
                </div>
                <div className="tooltip-stat text-xs">
                  <span className="text-teal inline-flex items-center gap-1">
                    <Icon
                      name="circle"
                      size="xs"
                      fill="currentColor"
                      ariaHidden
                    />{' '}
                    Khán giả:
                  </span>
                  <span>{slot.attendees}</span>
                </div>
                <div className="tooltip-stat text-xs">
                  <span className="text-amber inline-flex items-center gap-1">
                    <Icon
                      name="circle"
                      size="xs"
                      fill="currentColor"
                      ariaHidden
                    />{' '}
                    Ban tổ chức:
                  </span>
                  <span>{slot.organizers}</span>
                </div>
                <div className="tooltip-stat text-xs">
                  <span className="text-purple inline-flex items-center gap-1">
                    <Icon
                      name="circle"
                      size="xs"
                      fill="currentColor"
                      ariaHidden
                    />{' '}
                    Quản trị:
                  </span>
                  <span>{slot.admins}</span>
                </div>
              </div>
            );
          })()}
      </div>
    </article>
  );
};

export default TrafficDistributionChart;
