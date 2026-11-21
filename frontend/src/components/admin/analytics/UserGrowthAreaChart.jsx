import React from 'react';
import { Icon } from '../../ui/Icon';

/**
 * UserGrowthAreaChart Component
 * Renders an SVG area / line chart visualizing monthly registered user signups,
 * role segmentation, and cumulative growth over time.
 *
 * @param {Object} props
 * @param {Array} props.monthBuckets - Chronological aggregated month buckets
 * @param {number} props.lineChartMax - Normalized Y-axis upper bound
 * @param {number} props.totalUsersCount - Total platform registered users
 * @param {string|null} props.activeUserMonth - Currently hovered month key
 * @param {Function} props.setActiveUserMonth - State setter for hovered month
 */
export const UserGrowthAreaChart = ({
  monthBuckets = [],
  lineChartMax = 10,
  totalUsersCount = 0,
  activeUserMonth = null,
  setActiveUserMonth,
}) => {
  return (
    <article
      className="card chart-container-card"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
    >
      <div className="flex justify-between items-center mb-sm">
        <div>
          <h3 className="panel-title mb-0">2. Số Người Dùng Đăng Ký Ứng Dụng</h3>
          <p className="muted text-xs mt-01 mb-0">
            Xu hướng tăng trưởng tài khoản mới và tích lũy người dùng theo tháng
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs muted d-block">Tổng người dùng</span>
          <strong className="text-sm text-teal">
            {totalUsersCount} tài khoản
          </strong>
        </div>
      </div>

      {/* Chart Legend */}
      <div className="flex items-center gap-md text-xs mb-sm chart-legend-row">
        <div className="legend-item">
          <span
            className="legend-color-dot"
            style={{ background: '#0d9488' }}
          />
          <span>Đăng ký mới (New Signups)</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color-dot"
            style={{ background: '#8b5cf6' }}
          />
          <span>Khán giả (Attendees)</span>
        </div>
        <div className="legend-item">
          <span
            className="legend-color-dot"
            style={{ background: '#f59e0b' }}
          />
          <span>Ban tổ chức (Organizers)</span>
        </div>
      </div>

      {/* Responsive SVG Line Chart */}
      <div className="svg-chart-wrapper">
        <svg
          viewBox="0 0 540 220"
          className="analytics-svg-chart"
          role="img"
          aria-label="Biểu đồ đường tăng trưởng số người dùng đăng ký ứng dụng theo tháng"
        >
          <defs>
            <linearGradient id="userAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0d9488" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
            </linearGradient>
            <filter
              id="lineGlow"
              x="-20%"
              y="-20%"
              width="140%"
              height="140%"
            >
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="3"
                floodColor="#0d9488"
                floodOpacity="0.3"
              />
            </filter>
          </defs>

          {/* Horizontal Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = 180 - pct * 150;
            const val = Math.round(lineChartMax * pct);
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

          {/* Generate Area and Line Path Points */}
          {(() => {
            const points = monthBuckets.map((bucket, idx) => {
              const n = monthBuckets.length;
              const x = 60 + idx * (440 / Math.max(n - 1, 1));
              const y = 180 - (bucket.usersNew / lineChartMax) * 150;
              return { x, y, bucket };
            });

            const lineD = points
              .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
              .join(' ');
            const areaD = `${lineD} L ${points[points.length - 1].x} 180 L ${
              points[0].x
            } 180 Z`;

            return (
              <g>
                {/* Area gradient under curve */}
                <path d={areaD} fill="url(#userAreaGrad)" />

                {/* Smooth Line Path */}
                <path
                  d={lineD}
                  fill="none"
                  stroke="#0d9488"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#lineGlow)"
                />

                {/* Interactive Data Points */}
                {points.map((pt) => {
                  const isHovered = activeUserMonth === pt.bucket.key;
                  return (
                    <g
                      key={pt.bucket.key}
                      className="chart-circle-group"
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={`${pt.bucket.fullLabel}: ${pt.bucket.usersNew} người đăng ký mới`}
                      onMouseEnter={() => setActiveUserMonth(pt.bucket.key)}
                      onMouseLeave={() => setActiveUserMonth(null)}
                      onFocus={() => setActiveUserMonth(pt.bucket.key)}
                      onBlur={() => setActiveUserMonth(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Hover pulse circle */}
                      {isHovered && (
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="12"
                          fill="#0d9488"
                          opacity="0.2"
                        />
                      )}

                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={isHovered ? 7 : 4.5}
                        fill="#ffffff"
                        stroke="#0d9488"
                        strokeWidth={isHovered ? 3.5 : 2.5}
                        className="chart-circle-point"
                      />

                      {/* Number Badge above point */}
                      <text
                        x={pt.x}
                        y={Math.max(pt.y - 10, 25)}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="bold"
                        fill="var(--text-main, #0f172a)"
                      >
                        {pt.bucket.usersNew}
                      </text>

                      {/* X-axis Month Label */}
                      <text
                        x={pt.x}
                        y="200"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight={isHovered ? 'bold' : 'normal'}
                        fill={
                          isHovered
                            ? '#0d9488'
                            : 'var(--text-muted, #64748b)'
                        }
                      >
                        {pt.bucket.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </svg>

        {/* Floating Tooltip for User Month */}
        {activeUserMonth &&
          (() => {
            const b = monthBuckets.find(
              (item) => item.key === activeUserMonth
            );
            if (!b) return null;
            return (
              <div className="chart-tooltip active-tooltip">
                <div className="tooltip-date font-bold">{b.fullLabel}</div>
                <div className="tooltip-stat">
                  <span>Đăng ký mới:</span>
                  <strong className="text-teal font-bold">
                    {b.usersNew} tài khoản
                  </strong>
                </div>
                <div className="tooltip-stat text-xs">
                  <span className="text-purple inline-flex items-center gap-1">
                    <Icon
                      name="circle"
                      size="xs"
                      fill="currentColor"
                      ariaHidden
                    />{' '}
                    Khán giả (Attendees):
                  </span>
                  <span>{b.attendeesNew}</span>
                </div>
                <div className="tooltip-stat text-xs">
                  <span className="text-amber inline-flex items-center gap-1">
                    <Icon
                      name="circle"
                      size="xs"
                      fill="currentColor"
                      ariaHidden
                    />{' '}
                    Ban tổ chức (Organizers):
                  </span>
                  <span>{b.organizersNew}</span>
                </div>
              </div>
            );
          })()}
      </div>
    </article>
  );
};

export default UserGrowthAreaChart;
