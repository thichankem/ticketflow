import React, { useState, useMemo } from 'react';
import { Icon } from './ui/Icon';

// Color palette for order status fulfillment and charts (SPEC-ISSUE-002)
const STATUS_CONFIG = {
  COMPLETED: {
    name: 'Đơn Đã Thanh Toán (Completed)',
    shortName: 'Hoàn tất',
    color: '#10b981', // Emerald
    badgeClass: 'badge-emerald',
    desc: 'Đơn hàng thanh toán trực tuyến thành công, vé đã phát hành',
  },
  PENDING: {
    name: 'Đang Giữ Chỗ / Chờ Xử Lý (Pending)',
    shortName: 'Chờ thanh toán',
    color: '#3b82f6', // Blue
    badgeClass: 'badge-blue',
    desc: 'Đang trong thời hạn giữ chỗ 15 phút',
  },
  REFUNDED: {
    name: 'Đã Hoàn Tiền (Refunded)',
    shortName: 'Hoàn tiền',
    color: '#f59e0b', // Amber
    badgeClass: 'badge-amber',
    desc: 'Đơn hàng đã được hoàn tiền đầy đủ cho người mua',
  },
  CANCELLED: {
    name: 'Đã Hủy / Quá Hạn (Cancelled/Expired)',
    shortName: 'Đã hủy',
    color: '#ef4444', // Red
    badgeClass: 'badge-red',
    desc: 'Đơn quá hạn giữ chỗ 15 phút hoặc bị hủy',
  },
};

const formatVND = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount || 0);
};

export const AdminAnalyticsDashboard = ({
  events = [],
  users = [],
  orders = [],
  stats = {},
  onRefresh,
}) => {
  // Filter states
  const [timeRange, setTimeRange] = useState('6m'); // '6m' | '12m' | 'all'
  const [eventSortBy, setEventSortBy] = useState('purchases'); // 'purchases' | 'sold' | 'revenue'
  const [viewMode, setViewMode] = useState('charts'); // 'charts' | 'table'

  // Interactive hover tooltip states
  const [activeEventMonth, setActiveEventMonth] = useState(null);
  const [activeUserMonth, setActiveUserMonth] = useState(null);
  const [activePackageKey, setActivePackageKey] = useState(null);
  const [activeEventItem, setActiveEventItem] = useState(null);

  // 1. Generate chronological list of months for aggregation
  const monthBuckets = useMemo(() => {
    const numMonths = timeRange === 'all' ? 12 : timeRange === '12m' ? 12 : 6;
    const buckets = [];
    const now = new Date();

    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const label = `T${String(month).padStart(2, '0')}/${String(year).slice(-2)}`;
      const fullLabel = `Tháng ${String(month).padStart(2, '0')}/${year}`;

      buckets.push({
        key,
        year,
        month,
        label,
        fullLabel,
        // Event stats
        eventsTotal: 0,
        eventsLive: 0,
        eventsCompleted: 0,
        // User stats
        usersNew: 0,
        attendeesNew: 0,
        organizersNew: 0,
        adminsNew: 0,
        // Cumulative user count will be computed in second pass
        cumulativeUsers: 0,
      });
    }

    const bucketMap = new Map(buckets.map((b) => [b.key, b]));

    // 2. Aggregate Events into Months
    events.forEach((ev) => {
      const rawDate = ev.created_at || ev.starts_at || ev.start_date;
      if (!rawDate) return;
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.eventsTotal += 1;
        const status = (ev.status || '').toUpperCase();
        if (status === 'LIVE' || status === 'PUBLISHED') {
          bucket.eventsLive += 1;
        } else {
          bucket.eventsCompleted += 1;
        }
      }
    });

    // UI-12: Strict authentic timeline aggregation — no artificial cyclic distribution
    // Buckets outside data range remain honestly at zero.

    // 3. Aggregate Users into Months
    users.forEach((u) => {
      const rawDate = u.created_at;
      if (!rawDate) return;
      const d = new Date(rawDate);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const bucket = bucketMap.get(key);
      if (bucket) {
        bucket.usersNew += 1;
        const role = (u.role || '').toUpperCase();
        if (role === 'ORGANIZER') bucket.organizersNew += 1;
        else if (role === 'ADMIN') bucket.adminsNew += 1;
        else bucket.attendeesNew += 1;
      }
    });

    // Compute cumulative users
    let runningUsers = Math.max(0, users.length - buckets.reduce((sum, b) => sum + b.usersNew, 0));
    buckets.forEach((b) => {
      runningUsers += b.usersNew;
      b.cumulativeUsers = runningUsers;
    });

    return buckets;
  }, [events, users, timeRange]);

  // 4. Aggregate Order Status Fulfillment & Real Platform Metrics (UI-07: Genuine Order Metrics, no fake Premium/MRR)
  const orderStatusAnalytics = useMemo(() => {
    const counts = {
      COMPLETED: 0,
      PENDING: 0,
      REFUNDED: 0,
      CANCELLED: 0,
    };

    let totalGrossRevenue = 0;
    let completedRevenue = 0;

    orders.forEach((o) => {
      const st = (o.status || '').toUpperCase();
      const val = Number(o.total || o.total_gross || 0);
      totalGrossRevenue += val;

      if (st === 'COMPLETED' || st === 'PAID' || st === 'CONFIRMED') {
        counts.COMPLETED += 1;
        completedRevenue += val;
      } else if (st === 'REFUNDED') {
        counts.REFUNDED += 1;
      } else if (st === 'CANCELLED' || st === 'EXPIRED') {
        counts.CANCELLED += 1;
      } else {
        counts.PENDING += 1;
      }
    });

    const totalCount = Math.max(orders.length, 1);
    const completionRate = Math.round((counts.COMPLETED / totalCount) * 100);

    const packagesList = [
      {
        key: 'COMPLETED',
        ...STATUS_CONFIG.COMPLETED,
        count: counts.COMPLETED,
        percentage: Math.round((counts.COMPLETED / totalCount) * 100),
        amount: completedRevenue,
      },
      {
        key: 'PENDING',
        ...STATUS_CONFIG.PENDING,
        count: counts.PENDING,
        percentage: Math.round((counts.PENDING / totalCount) * 100),
        amount: 0,
      },
      {
        key: 'REFUNDED',
        ...STATUS_CONFIG.REFUNDED,
        count: counts.REFUNDED,
        percentage: Math.round((counts.REFUNDED / totalCount) * 100),
        amount: 0,
      },
      {
        key: 'CANCELLED',
        ...STATUS_CONFIG.CANCELLED,
        count: counts.CANCELLED,
        percentage: Math.round((counts.CANCELLED / totalCount) * 100),
        amount: 0,
      },
    ];

    // Compute SVG pie slice angles
    let currentAngle = 0;
    const slices = packagesList.map((pkg) => {
      const angle = (pkg.count / totalCount) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + angle;
      currentAngle += angle;
      return {
        ...pkg,
        startAngle,
        endAngle,
      };
    });

    return {
      packagesList,
      slices,
      totalCount: orders.length,
      completedCount: counts.COMPLETED,
      completionRate,
      completedRevenue,
      totalGrossRevenue,
    };
  }, [orders]);

  // 5. Aggregate Purchases and Orders per Individual Event
  const eventPurchasesList = useMemo(() => {
    // Group orders by event_id
    const ordersByEvent = new Map();
    orders.forEach((ord) => {
      const eid = Number(ord.event_id || 0);
      if (!ordersByEvent.has(eid)) {
        ordersByEvent.set(eid, { count: 0, revenue: 0, completedCount: 0 });
      }
      const data = ordersByEvent.get(eid);
      data.count += 1;
      const gross = Number(ord.total_gross || ord.total || 0);
      data.revenue += gross;
      if (ord.status === 'COMPLETED' || ord.status === 'PAID') {
        data.completedCount += 1;
      }
    });

    const list = events.map((ev) => {
      const ordData = ordersByEvent.get(Number(ev.id)) || { count: 0, revenue: 0, completedCount: 0 };
      const soldTickets = Number(ev.sold_tickets || ev.tickets_sold || 0);
      const totalTickets = Number(ev.total_tickets || ev.total_capacity || Math.max(soldTickets, 100));
      const fillRate = totalTickets > 0 ? Math.min(100, Math.round((soldTickets / totalTickets) * 100)) : 0;
      const revenue = Number(ev.gross_revenue || ordData.revenue || 0);
      // Purchases count: direct orders or estimated from sold tickets if orders table is sparse
      const purchases = ordData.count > 0 ? ordData.count : Math.max(Math.round(soldTickets / 1.8), soldTickets > 0 ? 1 : 0);

      return {
        id: ev.id,
        title: ev.title || `Sự kiện #${ev.id}`,
        status: ev.status || 'LIVE',
        purchases,
        soldTickets,
        totalTickets,
        fillRate,
        revenue,
      };
    });

    // Sort according to selection
    if (eventSortBy === 'purchases') {
      list.sort((a, b) => b.purchases - a.purchases);
    } else if (eventSortBy === 'sold') {
      list.sort((a, b) => b.soldTickets - a.soldTickets);
    } else if (eventSortBy === 'revenue') {
      list.sort((a, b) => b.revenue - a.revenue);
    }

    return list;
  }, [events, orders, eventSortBy]);

  // SVG Dimension Helpers
  const barChartMax = useMemo(() => {
    const maxVal = Math.max(...monthBuckets.map((b) => b.eventsTotal), 1);
    return Math.ceil(maxVal * 1.25);
  }, [monthBuckets]);

  const lineChartMax = useMemo(() => {
    const maxVal = Math.max(...monthBuckets.map((b) => b.usersNew), 1);
    return Math.ceil(maxVal * 1.25);
  }, [monthBuckets]);

  const maxEventPurchases = useMemo(() => {
    const maxVal = Math.max(...eventPurchasesList.map((e) => e.purchases), 1);
    return maxVal;
  }, [eventPurchasesList]);

  // Helper to generate SVG pie slice path
  const describeArc = (x, y, radius, innerRadius, startAngle, endAngle) => {
    if (endAngle - startAngle >= 359.99) {
      // Full circle with hole
      return `M ${x} ${y - radius} A ${radius} ${radius} 0 1 1 ${x} ${y + radius} A ${radius} ${radius} 0 1 1 ${x} ${y - radius} M ${x} ${y - innerRadius} A ${innerRadius} ${innerRadius} 0 1 0 ${x} ${y + innerRadius} A ${innerRadius} ${innerRadius} 0 1 0 ${x} ${y - innerRadius} Z`;
    }

    const polarToCartesian = (centerX, centerY, rad, angleInDegrees) => {
      const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
      return {
        x: centerX + rad * Math.cos(angleInRadians),
        y: centerY + rad * Math.sin(angleInRadians),
      };
    };

    const startOuter = polarToCartesian(x, y, radius, endAngle);
    const endOuter = polarToCartesian(x, y, radius, startAngle);
    const startInner = polarToCartesian(x, y, innerRadius, endAngle);
    const endInner = polarToCartesian(x, y, innerRadius, startAngle);

    const arcSweep = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M', startOuter.x, startOuter.y,
      'A', radius, radius, 0, arcSweep, 0, endOuter.x, endOuter.y,
      'L', endInner.x, endInner.y,
      'A', innerRadius, innerRadius, 0, arcSweep, 1, startInner.x, startInner.y,
      'Z',
    ].join(' ');
  };

  return (
    <section className="admin-analytics-dashboard stack" aria-label="Trung tâm dữ liệu Super Admin">
      {/* Top Header & Range Controls */}
      <div className="analytics-header-card flex justify-between items-center flex-wrap gap-md p-md">
        <div>
          <div className="flex items-center gap-sm">
            <span className="badge badge-primary">Super Admin Command Center</span>
            <span className="text-xs muted">Dữ liệu thời gian thực</span>
          </div>
          <h2 className="mt-02 mb-0">Hệ Thống Thống Kê & Phân Tích Toàn Sàn</h2>
          <p className="muted text-sm mt-01 mb-0">
            Tổng hợp sự kiện theo tháng, tăng trưởng người dùng, gói hội viên Premium và chi tiết lượt mua vé.
          </p>
        </div>

        <div className="flex items-center gap-sm flex-wrap">
          {/* Time Filter Pills */}
          <div className="filter-pills" role="group" aria-label="Khoảng thời gian thống kê">
            <button
              type="button"
              className={`filter-pill ${timeRange === '6m' ? 'active' : ''}`}
              onClick={() => setTimeRange('6m')}
            >
              6 tháng gần nhất
            </button>
            <button
              type="button"
              className={`filter-pill ${timeRange === '12m' ? 'active' : ''}`}
              onClick={() => setTimeRange('12m')}
            >
              12 tháng
            </button>
            <button
              type="button"
              className={`filter-pill ${timeRange === 'all' ? 'active' : ''}`}
              onClick={() => setTimeRange('all')}
            >
              Tất cả
            </button>
          </div>

          {/* View Mode Toggle: Charts vs Accessible Data Table */}
          <div className="filter-pills" role="group" aria-label="Chế độ hiển thị">
            <button
              type="button"
              className={`filter-pill flex items-center gap-1.5 ${viewMode === 'charts' ? 'active' : ''}`}
              onClick={() => setViewMode('charts')}
              title="Xem biểu đồ trực quan"
            >
              <Icon name="chart" size="xs" ariaHidden />
              <span>Biểu đồ</span>
            </button>
            <button
              type="button"
              className={`filter-pill flex items-center gap-1.5 ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Xem bảng số liệu chi tiết"
            >
              <Icon name="table" size="xs" ariaHidden />
              <span>Bảng số liệu</span>
            </button>
          </div>

          {onRefresh && (
            <button
              type="button"
              className="btn btn-secondary btn-sm flex items-center gap-1.5"
              onClick={onRefresh}
              title="Làm mới dữ liệu từ máy chủ"
            >
              <Icon name="refresh" size="xs" ariaHidden />
              <span>Làm mới</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Ribbon Summary */}
      <div className="kpi-grid admin-kpi-grid">
        <article className="card analytics-kpi-card admin-kpi-card">
          <div className="admin-kpi-top-bar" style={{ background: 'linear-gradient(90deg, #3b82f6, #60a5fa)' }} />
          <div className="admin-kpi-label-row">
            <span className="admin-kpi-title">Tổng Sự Kiện Toàn Sàn</span>
            <span className="badge badge-primary admin-kpi-tag">Event Catalog</span>
          </div>
          <div className="admin-kpi-number">{events.length}</div>
          <div className="admin-micro-track">
            <div
              className="admin-micro-fill"
              style={{
                width: `${events.length > 0 ? Math.round((events.filter((e) => e.status === 'LIVE' || e.status === 'PUBLISHED').length / events.length) * 100) : 0}%`,
                background: '#3b82f6'
              }}
            />
          </div>
          <div className="admin-kpi-footer">
            <span className="text-good font-semibold">
              ● {events.filter((e) => e.status === 'LIVE' || e.status === 'PUBLISHED').length} Đang mở bán
            </span>
            <span className="muted font-mono">
              {events.filter((e) => e.status !== 'LIVE' && e.status !== 'PUBLISHED').length} bản nháp / kết thúc
            </span>
          </div>
        </article>

        <article className="card analytics-kpi-card admin-kpi-card">
          <div className="admin-kpi-top-bar" style={{ background: 'linear-gradient(90deg, #8b5cf6, #a78bfa)' }} />
          <div className="admin-kpi-label-row">
            <span className="admin-kpi-title">Người Dùng Ứng Dụng</span>
            <span className="badge badge-teal admin-kpi-tag">Users Growth</span>
          </div>
          <div className="admin-kpi-number">{users.length}</div>
          <div className="admin-micro-track">
            <div
              className="admin-micro-fill"
              style={{
                width: `${users.length > 0 ? Math.round((users.filter((u) => u.role === 'ATTENDEE').length / users.length) * 100) : 0}%`,
                background: '#8b5cf6'
              }}
            />
          </div>
          <div className="admin-kpi-footer">
            <span className="text-good font-semibold">
              ● {users.filter((u) => u.role === 'ATTENDEE').length} Khán giả
            </span>
            <span className="font-semibold text-purple font-mono">
              ● {users.filter((u) => u.role === 'ORGANIZER').length} Ban tổ chức
            </span>
          </div>
        </article>

        <article className="card analytics-kpi-card admin-kpi-card">
          <div className="admin-kpi-top-bar" style={{ background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
          <div className="admin-kpi-label-row">
            <span className="admin-kpi-title">Tỷ Lệ Hoàn Tất Đơn</span>
            <span className="badge badge-success admin-kpi-tag">Fulfillment</span>
          </div>
          <div className="admin-kpi-number">{orderStatusAnalytics.completionRate}%</div>
          <div className="admin-micro-track">
            <div
              className="admin-micro-fill"
              style={{
                width: `${orderStatusAnalytics.completionRate}%`,
                background: '#10b981'
              }}
            />
          </div>
          <div className="admin-kpi-footer">
            <span className="text-good font-semibold">
              {orderStatusAnalytics.completedCount} / {orderStatusAnalytics.totalCount} đơn thành công
            </span>
            <span className="font-mono font-bold text-good">{formatVND(orderStatusAnalytics.completedRevenue)}</span>
          </div>
        </article>

        <article className="card analytics-kpi-card admin-kpi-card">
          <div className="admin-kpi-top-bar" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24)' }} />
          <div className="admin-kpi-label-row">
            <span className="admin-kpi-title">Tổng Lượt Mua Vé Sàn</span>
            <span className="badge badge-warning admin-kpi-tag">GMV Gross</span>
          </div>
          <div className="admin-kpi-number">{orders.length || eventPurchasesList.reduce((s, e) => s + e.purchases, 0)}</div>
          <div className="admin-micro-track">
            <div
              className="admin-micro-fill"
              style={{
                width: '100%',
                background: '#f59e0b'
              }}
            />
          </div>
          <div className="admin-kpi-footer">
            <span className="text-good font-semibold font-mono">
              GMV: {formatVND(stats?.gross_sales || stats?.grossRevenue || eventPurchasesList.reduce((s, e) => s + e.revenue, 0))}
            </span>
            <span className="muted font-mono">
              {stats?.platform_fee
                ? `Hoa hồng: ${formatVND(stats.platform_fee)}`
                : stats?.total_commission
                ? `Hoa hồng: ${formatVND(stats.total_commission)}`
                : 'Phí sàn 10%'}
            </span>
          </div>
        </article>
      </div>

      {/* Main Charts View */}
      {viewMode === 'charts' ? (
        <div className="stack gap-lg">
          {/* TOP ROW: 2 Primary Charts (Monthly Events Bar Chart & User Registration Line Chart) */}
          <div className="grid-2-cols gap-md">
            {/* CHART 1: Thống kê số sự kiện theo tháng (Bar Chart) */}
            <article className="card chart-container-card" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}>
              <div className="flex justify-between items-center mb-sm">
                <div>
                  <div className="flex items-center gap-xs">
                    <span className="chart-badge bar-chart-badge">Biểu Đồ Cột</span>
                    <h3 className="panel-title mb-0">1. Số Sự Kiện Theo Tháng</h3>
                  </div>
                  <p className="muted text-xs mt-01 mb-0">
                    Phân bố số lượng sự kiện tạo mới và tổ chức theo chu kỳ tháng
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs muted d-block">Tổng trong kỳ</span>
                  <strong className="text-sm text-primary">
                    {monthBuckets.reduce((sum, b) => sum + b.eventsTotal, 0)} sự kiện
                  </strong>
                </div>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center gap-md text-xs mb-sm chart-legend-row">
                <div className="legend-item">
                  <span className="legend-color-dot" style={{ background: '#3b82f6' }}></span>
                  <span>Đang mở bán (Live)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-dot" style={{ background: '#93c5fd' }}></span>
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
                {activeEventMonth && (
                  (() => {
                    const b = monthBuckets.find((item) => item.key === activeEventMonth);
                    if (!b) return null;
                    return (
                      <div className="chart-tooltip active-tooltip">
                        <div className="tooltip-date font-bold">{b.fullLabel}</div>
                        <div className="tooltip-stat">
                          <span>Tổng số sự kiện:</span>
                          <strong className="text-primary">{b.eventsTotal}</strong>
                        </div>
                        <div className="tooltip-stat text-xs">
                          <span className="text-good">● Đang mở bán:</span>
                          <span>{b.eventsLive}</span>
                        </div>
                        <div className="tooltip-stat text-xs">
                          <span className="muted">● Hoàn thành / Khác:</span>
                          <span>{b.eventsCompleted}</span>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </article>

            {/* CHART 2: Số người dùng đăng kí ứng dụng (Line / Area Chart) */}
            <article className="card chart-container-card" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}>
              <div className="flex justify-between items-center mb-sm">
                <div>
                  <div className="flex items-center gap-xs">
                    <span className="chart-badge line-chart-badge">Biểu Đồ Đường</span>
                    <h3 className="panel-title mb-0">2. Số Người Dùng Đăng Ký Ứng Dụng</h3>
                  </div>
                  <p className="muted text-xs mt-01 mb-0">
                    Xu hướng tăng trưởng tài khoản mới và tích lũy người dùng theo tháng
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs muted d-block">Tổng người dùng</span>
                  <strong className="text-sm text-teal">{users.length} tài khoản</strong>
                </div>
              </div>

              {/* Chart Legend */}
              <div className="flex items-center gap-md text-xs mb-sm chart-legend-row">
                <div className="legend-item">
                  <span className="legend-color-dot" style={{ background: '#0d9488' }}></span>
                  <span>Đăng ký mới (New Signups)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-dot" style={{ background: '#8b5cf6' }}></span>
                  <span>Khán giả (Attendees)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-color-dot" style={{ background: '#f59e0b' }}></span>
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
                    <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0d9488" floodOpacity="0.3" />
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

                    const lineD = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                    const areaD = `${lineD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;

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
                                fill={isHovered ? '#0d9488' : 'var(--text-muted, #64748b)'}
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
                {activeUserMonth && (
                  (() => {
                    const b = monthBuckets.find((item) => item.key === activeUserMonth);
                    if (!b) return null;
                    return (
                      <div className="chart-tooltip active-tooltip">
                        <div className="tooltip-date font-bold">{b.fullLabel}</div>
                        <div className="tooltip-stat">
                          <span>Đăng ký mới:</span>
                          <strong className="text-teal font-bold">{b.usersNew} tài khoản</strong>
                        </div>
                        <div className="tooltip-stat text-xs">
                          <span className="text-purple">● Khán giả (Attendees):</span>
                          <span>{b.attendeesNew}</span>
                        </div>
                        <div className="tooltip-stat text-xs">
                          <span className="text-amber">● Ban tổ chức (Organizers):</span>
                          <span>{b.organizersNew}</span>
                        </div>
                        <div className="tooltip-stat text-xs border-top pt-01 mt-01">
                          <span className="muted">Tích lũy đến tháng này:</span>
                          <span className="font-mono">{b.cumulativeUsers} user</span>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            </article>
          </div>

          {/* BOTTOM ROW: 2 Additional Charts (Premium Donut Chart & Event Purchases Horizontal Bar Chart) */}
          <div className="grid-2-cols gap-md">
            {/* CHART 3: Cơ cấu đơn hàng & Thực thu sàn (SPEC-ISSUE-002) */}
            <article className="card chart-container-card" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 340px' }}>
              <div className="flex justify-between items-center mb-sm">
                <div>
                  <div className="flex items-center gap-xs">
                    <span className="chart-badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                      Biểu Đồ Tròn / Donut
                    </span>
                    <h3 className="panel-title mb-0">3. Cơ Cấu Đơn Hàng & Doanh Thu Sàn</h3>
                  </div>
                  <p className="muted text-xs mt-01 mb-0">
                    Phân bổ đơn hàng theo trạng thái hoàn thành, chờ xử lý, hoàn tiền và hủy đơn
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs muted d-block">Tỷ lệ hoàn thành</span>
                  <strong className="text-sm text-good">{orderStatusAnalytics.completionRate}% đơn hàng</strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-md mt-sm">
                {/* SVG Donut Chart with center summary */}
                <div className="donut-chart-container relative flex items-center justify-center" style={{ width: '220px', height: '220px', margin: '0 auto' }}>
                  <svg
                    viewBox="0 0 220 220"
                    width="220"
                    height="220"
                    role="img"
                    aria-label="Biểu đồ tròn cơ cấu đơn hàng và trạng thái thanh toán"
                  >
                    <defs>
                      <filter id="donutShadow" x="-10%" y="-10%" width="120%" height="120%">
                        <feDropShadow dx="0" dy="2" stdDeviation="4" floodOpacity="0.15" />
                      </filter>
                    </defs>

                    {/* Background circle track */}
                    <circle cx="110" cy="110" r="85" fill="none" stroke="var(--border-subtle, #f1f5f9)" strokeWidth="32" />

                    {/* Donut Slices */}
                    {orderStatusAnalytics.slices.map((slice) => {
                      const isHovered = activePackageKey === slice.key;
                      const path = describeArc(110, 110, isHovered ? 96 : 90, isHovered ? 56 : 60, slice.startAngle, slice.endAngle);

                      return (
                        <path
                          key={slice.key}
                          d={path}
                          fill={slice.color}
                          filter="url(#donutShadow)"
                          opacity={activePackageKey && !isHovered ? 0.45 : 1}
                          stroke="#ffffff"
                          strokeWidth="2"
                          tabIndex={0}
                          role="graphics-symbol"
                          aria-label={`${slice.name}: ${slice.count} đơn (${slice.percentage}%)`}
                          onMouseEnter={() => setActivePackageKey(slice.key)}
                          onMouseLeave={() => setActivePackageKey(null)}
                          onFocus={() => setActivePackageKey(slice.key)}
                          onBlur={() => setActivePackageKey(null)}
                          style={{
                            cursor: 'pointer',
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          }}
                        />
                      );
                    })}
                  </svg>

                  {/* Glowing Center Badge */}
                  <div
                    className="donut-center-content absolute text-center pointer-events-none"
                    style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '50%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span className="text-xs muted font-semibold">TỔNG ĐƠN</span>
                    <strong className="text-xl text-primary leading-none mt-01">
                      {orderStatusAnalytics.totalCount}
                    </strong>
                    <span className="text-2xs text-good font-bold mt-01">
                      {orderStatusAnalytics.completionRate}% Thành công
                    </span>
                  </div>
                </div>

                {/* Donut Breakdown Legend Cards */}
                <div className="flex-1 stack gap-xs min-w-240">
                  {orderStatusAnalytics.packagesList.map((pkg) => {
                    const isHovered = activePackageKey === pkg.key;
                    return (
                      <div
                        key={pkg.key}
                        className={`p-xs rounded border transition-all ${isHovered ? 'bg-active-row border-primary' : 'border-subtle'}`}
                        onMouseEnter={() => setActivePackageKey(pkg.key)}
                        onMouseLeave={() => setActivePackageKey(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-xs">
                            <span
                              className="legend-color-dot"
                              style={{ background: pkg.color, width: '12px', height: '12px', borderRadius: '50%' }}
                            ></span>
                            <strong className="text-xs">{pkg.shortName}</strong>
                          </div>
                          <div className="flex items-center gap-sm">
                            <span className="badge text-xs" style={{ background: `${pkg.color}20`, color: pkg.color }}>
                              {pkg.percentage}%
                            </span>
                            <span className="font-mono text-xs font-bold">{pkg.count} đơn</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-xs muted mt-01">
                          <span>{pkg.desc}</span>
                          {pkg.amount > 0 && (
                            <span className="text-good font-mono font-semibold">
                              {formatVND(pkg.amount)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </article>

            {/* CHART 4: Số lượt mua vé của từng sự kiện (Horizontal Bar Chart) */}
            <article className="card chart-container-card" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 340px' }}>
              <div className="flex justify-between items-center mb-sm">
                <div>
                  <div className="flex items-center gap-xs">
                    <span className="chart-badge" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                      Biểu Đồ Cột Ngang
                    </span>
                    <h3 className="panel-title mb-0">4. Số Lượt Mua Vé Của Từng Sự Kiện</h3>
                  </div>
                  <p className="muted text-xs mt-01 mb-0">
                    Chi tiết lượt mua, số vé đã bán và doanh thu của từng sự kiện
                  </p>
                </div>

                {/* Sort Toggle */}
                <div className="flex items-center gap-xs">
                  <span className="text-xs muted">Xếp theo:</span>
                  <select
                    className="input input-sm py-01 px-02 text-xs"
                    value={eventSortBy}
                    onChange={(e) => setEventSortBy(e.target.value)}
                    aria-label="Sắp xếp sự kiện theo tiêu chí"
                  >
                    <option value="purchases">Lượt mua vé (Orders)</option>
                    <option value="sold">Số vé đã bán</option>
                    <option value="revenue">Doanh thu (VNĐ)</option>
                  </select>
                </div>
              </div>

              {/* Event Horizontal Bars List */}
              <div className="event-bars-scroll-list stack gap-sm" style={{ maxHeight: '270px', overflowY: 'auto', paddingRight: '4px' }}>
                {eventPurchasesList.slice(0, 8).map((ev, idx) => {
                  const barPct = Math.max(8, Math.round((ev.purchases / maxEventPurchases) * 100));
                  const isHovered = activeEventItem === ev.id;

                  return (
                    <div
                      key={ev.id}
                      className={`event-bar-card p-xs rounded border transition-all ${isHovered ? 'bg-active-row border-primary' : 'border-subtle'}`}
                      tabIndex={0}
                      role="graphics-symbol"
                      aria-label={`${ev.title}: ${ev.purchases} lượt mua, ${ev.soldTickets} vé, doanh thu ${formatVND(ev.revenue)}`}
                      onMouseEnter={() => setActiveEventItem(ev.id)}
                      onMouseLeave={() => setActiveEventItem(null)}
                      onFocus={() => setActiveEventItem(ev.id)}
                      onBlur={() => setActiveEventItem(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="flex justify-between items-center mb-01">
                        <div className="flex items-center gap-xs flex-1 min-w-0 pr-sm">
                          <span className="font-mono text-xs font-bold text-muted">#{idx + 1}</span>
                          <span className="font-semibold text-xs truncate" title={ev.title}>
                            {ev.title}
                          </span>
                          <span className={`badge ${ev.status === 'LIVE' ? 'badge-success' : 'badge-slate'} text-2xs`}>
                            {ev.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-md text-xs font-mono flex-shrink-0">
                          <strong className="text-primary">{ev.purchases} lượt mua</strong>
                          <span className="muted">|</span>
                          <span className="text-teal font-semibold">{ev.soldTickets} vé</span>
                          <span className="muted">|</span>
                          <span className="font-semibold">{formatVND(ev.revenue)}</span>
                        </div>
                      </div>

                      {/* Animated Progress Bar representing purchase volume */}
                      <div className="horizontal-bar-track" style={{ height: '8px', background: 'var(--bg-muted, #f1f5f9)', borderRadius: '999px', overflow: 'hidden' }}>
                        <div
                          className="horizontal-bar-fill"
                          style={{
                            width: `${barPct}%`,
                            height: '100%',
                            borderRadius: '999px',
                            background: `linear-gradient(in oklch to right, #0d9488, #3b82f6)`,
                            transition: 'width 0.4s ease-out',
                          }}
                        ></div>
                      </div>

                      {/* Capacity progress info */}
                      <div className="flex justify-between items-center text-2xs muted mt-01">
                        <span>Tỷ lệ lấp đầy: {ev.fillRate}% ({ev.soldTickets}/{ev.totalTickets} vé)</span>
                        <span>{ev.revenue > 0 ? `Bình quân: ${formatVND(Math.round(ev.revenue / Math.max(ev.purchases, 1)))}/đơn` : ''}</span>
                      </div>
                    </div>
                  );
                })}

                {eventPurchasesList.length === 0 && (
                  <div className="text-center p-md muted text-xs">
                    Chưa có sự kiện nào trong danh mục.
                  </div>
                )}
              </div>
            </article>
          </div>
        </div>
      ) : (
        /* ACCESSIBLE SEMANTIC DATA TABLE (Screen Reader & Audit Companion) */
        <div className="card accessible-table-wrapper" style={{ overflowX: 'auto' }}>
          <div className="flex justify-between items-center mb-md">
            <div>
              <h3 className="panel-title mb-0">Bảng Dữ Liệu Thống Kê Tổng Hợp Chi Tiết</h3>
              <p className="muted text-xs mt-01 mb-0">
                Hiển thị số liệu dạng bảng ngữ nghĩa, hỗ trợ công nghệ trợ năng và đối soát
              </p>
            </div>
            <span className="badge badge-primary">Tabular Data Grid</span>
          </div>

          {/* Table 1: Thống kê sự kiện & Người dùng theo tháng */}
          <div className="mb-lg">
            <h4 className="text-sm font-bold mb-xs text-primary">Bảng 1: Thống Kê Sự Kiện & Người Dùng Theo Tháng</h4>
            <table className="table" aria-label="Bảng thống kê sự kiện và người dùng theo tháng">
              <caption className="sr-only">Thống kê số lượng sự kiện và người dùng đăng ký theo từng tháng</caption>
              <thead>
                <tr>
                  <th scope="col">Tháng</th>
                  <th scope="col" className="text-right">Tổng Sự Kiện</th>
                  <th scope="col" className="text-right">Sự Kiện Live</th>
                  <th scope="col" className="text-right">Sự Kiện Hoàn Thành</th>
                  <th scope="col" className="text-right">User Đăng Ký Mới</th>
                  <th scope="col" className="text-right">Khán Giả Mới</th>
                  <th scope="col" className="text-right">Ban Tổ Chức Mới</th>
                  <th scope="col" className="text-right">Tổng User Tích Lũy</th>
                </tr>
              </thead>
              <tbody>
                {monthBuckets.map((b) => (
                  <tr key={b.key}>
                    <th scope="row" className="font-semibold">{b.fullLabel}</th>
                    <td className="text-right font-bold text-primary">{b.eventsTotal}</td>
                    <td className="text-right text-good">{b.eventsLive}</td>
                    <td className="text-right muted">{b.eventsCompleted}</td>
                    <td className="text-right font-bold text-teal">{b.usersNew}</td>
                    <td className="text-right text-purple">{b.attendeesNew}</td>
                    <td className="text-right text-amber">{b.organizersNew}</td>
                    <td className="text-right font-mono">{b.cumulativeUsers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table 2: Chi tiết lượt mua vé theo từng sự kiện */}
          <div>
            <h4 className="text-sm font-bold mb-xs text-teal">Bảng 2: Chi Tiết Lượt Mua Vé Của Từng Sự Kiện</h4>
            <table className="table" aria-label="Bảng chi tiết lượt mua vé theo từng sự kiện">
              <caption className="sr-only">Chi tiết số lượt mua, số vé đã bán và tổng doanh thu theo từng sự kiện</caption>
              <thead>
                <tr>
                  <th scope="col">Mã</th>
                  <th scope="col">Tên Sự Kiện</th>
                  <th scope="col">Trạng Thái</th>
                  <th scope="col" className="text-right">Lượt Mua (Orders)</th>
                  <th scope="col" className="text-right">Vé Đã Bán</th>
                  <th scope="col" className="text-right">Tổng Sức Chứa</th>
                  <th scope="col" className="text-right">Tỷ Lệ Lấp Đầy</th>
                  <th scope="col" className="text-right">Doanh Thu (VNĐ)</th>
                </tr>
              </thead>
              <tbody>
                {eventPurchasesList.map((ev) => (
                  <tr key={ev.id}>
                    <td className="font-mono text-xs">#{ev.id}</td>
                    <th scope="row" className="font-semibold">{ev.title}</th>
                    <td>
                      <span className={`badge ${ev.status === 'LIVE' ? 'badge-success' : 'badge-slate'} text-xs`}>
                        {ev.status}
                      </span>
                    </td>
                    <td className="text-right font-bold text-primary">{ev.purchases}</td>
                    <td className="text-right text-teal font-semibold">{ev.soldTickets}</td>
                    <td className="text-right muted">{ev.totalTickets}</td>
                    <td className="text-right">{ev.fillRate}%</td>
                    <td className="text-right font-mono font-bold">{formatVND(ev.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminAnalyticsDashboard;
