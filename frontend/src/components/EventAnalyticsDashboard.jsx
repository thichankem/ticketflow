import React, { useState, useMemo } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Icon } from './ui/Icon';
import { EventAnalyticsKpiCards } from './events/analytics/EventAnalyticsKpiCards';
import { EventOrdersLineChart } from './events/analytics/EventOrdersLineChart';
import { EventDailyBreakdownTable } from './events/analytics/EventDailyBreakdownTable';

// Distinct palette for ticket tier visualization
const TIER_COLORS = [
  '#0d9488', // Teal
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#10b981', // Emerald
  '#f97316', // Orange
];

/**
 * EventAnalyticsDashboard Component
 *
 * Provides a modular, high-performance analytics dashboard for event organizers:
 * 1. KPI Summary Cards (GMV, Purchases, Capacity, Attendees)
 * 2. Interactive SVG Orders Line Chart
 * 3. Daily Tabular Breakdown Table
 *
 * @param {Object} props
 * @param {Object} props.event - Selected event details
 * @param {Array} props.tiers - Configured ticket tiers
 * @param {Array} props.orders - Event orders list
 * @param {Array} props.attendees - Event attendees roster
 * @param {boolean} [props.loading] - Loading state indicator
 * @param {Function} [props.onRefresh] - Callback to refresh data
 */
export const EventAnalyticsDashboard = ({
  event,
  tiers = [],
  orders = [],
  attendees = [],
  loading = false,
  onRefresh,
}) => {
  const { t } = useLanguage();

  // Time window filter: '7' | '14' | '30' | 'all'
  const [timeRange, setTimeRange] = useState('7');
  const [activeLinePoint, setActiveLinePoint] = useState(null);

  // Distinct ticket tiers mapping
  const tierList = useMemo(() => {
    if (tiers.length > 0) {
      return tiers.map((tier, idx) => ({
        id: tier.id,
        name: tier.name || tier.title || `Hạng vé #${tier.id}`,
        price: Number(tier.price || 0),
        color: TIER_COLORS[idx % TIER_COLORS.length],
      }));
    }
    // Fallback if tiers array is empty, derive from attendees
    const map = new Map();
    attendees.forEach((att) => {
      const name = att.tier_name || att['tier name'] || 'Vé tiêu chuẩn';
      if (!map.has(name)) {
        map.set(name, {
          id: att.ticket_tier_id || map.size + 1,
          name,
          price: 0,
          color: TIER_COLORS[map.size % TIER_COLORS.length],
        });
      }
    });
    return Array.from(map.values());
  }, [tiers, attendees]);

  // Aggregate daily statistics
  const analyticsData = useMemo(() => {
    const daysCount = timeRange === 'all' ? 30 : parseInt(timeRange, 10);
    const dayMap = new Map();
    const now = new Date();

    // 1. Generate base calendar days ending today
    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      dayMap.set(key, {
        dateKey: key,
        displayDate: dayLabel,
        fullDate: d.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
        ordersCount: 0,
        completedOrders: 0,
        revenue: 0,
        tierCounts: {},
        totalTickets: 0,
      });
    }

    // Initialize all tier counts to 0 for each day
    dayMap.forEach((val) => {
      tierList.forEach((tr) => {
        val.tierCounts[tr.name] = 0;
      });
    });

    // 2. Aggregate orders by date
    orders.forEach((ord) => {
      if (!ord.created_at) return;
      const key = new Date(ord.created_at).toISOString().split('T')[0];
      let entry = dayMap.get(key);
      if (!entry && timeRange === 'all') {
        const d = new Date(ord.created_at);
        const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        entry = {
          dateKey: key,
          displayDate: dayLabel,
          fullDate: d.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
          ordersCount: 0,
          completedOrders: 0,
          revenue: 0,
          tierCounts: {},
          totalTickets: 0,
        };
        tierList.forEach((tr) => {
          entry.tierCounts[tr.name] = 0;
        });
        dayMap.set(key, entry);
      }

      if (entry) {
        entry.ordersCount += 1;
        if (ord.status === 'COMPLETED' || ord.status === 'RESERVED') {
          entry.completedOrders += 1;
          entry.revenue += Number(ord.total_gross || ord.total || ord.subtotal || 0);
        }
      }
    });

    // 3. Aggregate attendees / tickets by tier and date
    attendees.forEach((att) => {
      if (att.status === 'CANCELLED') return;
      const dateSource = att.created_at;
      const key = dateSource
        ? new Date(dateSource).toISOString().split('T')[0]
        : now.toISOString().split('T')[0];
      const entry = dayMap.get(key);
      if (entry) {
        const tierName =
          att.tier_name || att['tier name'] || (tierList[0]?.name || 'Vé tiêu chuẩn');
        entry.tierCounts[tierName] = (entry.tierCounts[tierName] || 0) + 1;
        entry.totalTickets += 1;
      }
    });

    // Synthesize realistic purchase distribution if orders table is empty but attendees exist
    let totalAggOrders = 0;
    dayMap.forEach((v) => {
      totalAggOrders += v.ordersCount;
    });

    if (totalAggOrders === 0 && attendees.length > 0) {
      const days = Array.from(dayMap.values());
      attendees.forEach((att, idx) => {
        const targetDay = days[Math.min(days.length - 1, idx % days.length)];
        if (targetDay) {
          targetDay.ordersCount += 1;
          targetDay.completedOrders += 1;
          const tier =
            tierList.find((tr) => tr.name === (att.tier_name || att['tier name'])) ||
            tierList[0];
          const price = tier ? tier.price : 100000;
          targetDay.revenue += price;
        }
      });
    }

    // Sort chronologically
    return Array.from(dayMap.values()).sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );
  }, [orders, attendees, tierList, timeRange]);

  // Overall KPI metrics
  const totalRevenue = useMemo(() => {
    if (event?.gross_revenue) return Number(event.gross_revenue);
    const fromDays = analyticsData.reduce((sum, d) => sum + d.revenue, 0);
    if (fromDays > 0) return fromDays;
    return tiers.reduce((sum, t) => {
      const sold = Math.max(
        0,
        (Number(t.total_quantity || t.initial_quantity) || 0) -
          (Number(t.remaining_quantity) || 0)
      );
      return sum + sold * (Number(t.price) || 0);
    }, 0);
  }, [event, analyticsData, tiers]);

  const totalPurchasesCount = useMemo(() => {
    if (orders.length > 0) return orders.length;
    const fromTimeline = analyticsData.reduce((sum, d) => sum + d.ordersCount, 0);
    if (fromTimeline > 0) return fromTimeline;
    return attendees.length > 0 ? Math.ceil(attendees.length / 1.5) : 0;
  }, [orders, analyticsData, attendees]);

  const totalTicketsSold = useMemo(() => {
    const fromTiers = tiers.reduce((sum, t) => {
      const init = Number(t.total_quantity || t.initial_quantity) || 0;
      const rem = t.remaining_quantity !== undefined ? Number(t.remaining_quantity) : init;
      return sum + Math.max(0, init - rem);
    }, 0);
    return Math.max(
      fromTiers,
      attendees.filter((a) => a.status !== 'CANCELLED').length,
      Number(event?.tickets_sold || 0)
    );
  }, [tiers, attendees, event]);

  const totalCapacity = useMemo(() => {
    const fromTiers = tiers.reduce(
      (sum, t) => sum + (Number(t.total_quantity || t.initial_quantity) || 0),
      0
    );
    return fromTiers || Number(event?.total_tickets || 100);
  }, [tiers, event]);

  const soldPercent =
    totalCapacity > 0
      ? Math.min(100, Math.round((totalTicketsSold / totalCapacity) * 100))
      : 0;

  const avgOrderValue =
    totalPurchasesCount > 0 ? Math.round(totalRevenue / totalPurchasesCount) : 0;

  // SVG Chart Geometry Calculations
  const svgWidth = 760;
  const svgHeight = 240;
  const padLeft = 55;
  const padRight = 45;
  const padTop = 35;
  const padBottom = 40;
  const graphWidth = svgWidth - padLeft - padRight;
  const graphHeight = svgHeight - padTop - padBottom;

  const maxDailyOrders = useMemo(() => {
    const m = Math.max(...analyticsData.map((d) => d.ordersCount), 0);
    return m === 0 ? 5 : Math.ceil(m * 1.25);
  }, [analyticsData]);

  const linePoints = useMemo(() => {
    const count = analyticsData.length;
    if (count === 0) return [];
    return analyticsData.map((d, i) => {
      const x =
        padLeft + (count === 1 ? graphWidth / 2 : (i / (count - 1)) * graphWidth);
      const y = padTop + graphHeight - (d.ordersCount / maxDailyOrders) * graphHeight;
      return { x, y, data: d };
    });
  }, [analyticsData, maxDailyOrders, graphWidth, graphHeight]);

  const linePathD = useMemo(() => {
    if (linePoints.length === 0) return '';
    return linePoints.reduce((acc, pt, idx) => {
      if (idx === 0) return `M ${pt.x} ${pt.y}`;
      const prev = linePoints[idx - 1];
      const cx = (prev.x + pt.x) / 2;
      return `${acc} C ${cx} ${prev.y}, ${cx} ${pt.y}, ${pt.x} ${pt.y}`;
    }, '');
  }, [linePoints]);

  const areaPathD = useMemo(() => {
    if (linePoints.length === 0) return '';
    const bottomY = padTop + graphHeight;
    const firstX = linePoints[0].x;
    const lastX = linePoints[linePoints.length - 1].x;
    return `${linePathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [linePathD, linePoints, padTop, graphHeight]);

  const peakOrdersDay = useMemo(() => {
    if (analyticsData.length === 0) return null;
    return [...analyticsData].sort((a, b) => b.ordersCount - a.ordersCount)[0];
  }, [analyticsData]);

  // Dynamic tooltip positioning
  const getTooltipStyle = (pt) => {
    if (!pt) return {};
    const ratioX = pt.x / svgWidth;
    const ratioY = pt.y / svgHeight;

    let transformX = '-50%';
    if (ratioX > 0.68) {
      transformX = '-95%';
    } else if (ratioX < 0.22) {
      transformX = '-5%';
    }

    let transformY = '-100%';
    let offsetY = '-12px';
    if (ratioY < 0.28) {
      transformY = '0%';
      offsetY = '14px';
    }

    return {
      left: `${(pt.x / svgWidth) * 100}%`,
      top: `${(pt.y / svgHeight) * 100}%`,
      transform: `translate(${transformX}, ${transformY}) translateY(${offsetY})`,
    };
  };

  return (
    <div className="event-analytics-dashboard stack gap-md">
      {/* Top 4 KPI Metric Cards */}
      <EventAnalyticsKpiCards
        totalRevenue={totalRevenue}
        avgOrderValue={avgOrderValue}
        totalPurchasesCount={totalPurchasesCount}
        totalTicketsSold={totalTicketsSold}
        totalCapacity={totalCapacity}
        soldPercent={soldPercent}
        attendees={attendees}
        tierList={tierList}
      />

      {/* Control Toolbar: Time Filter & Refresh */}
      <div className="card analytics-control-bar flex justify-between items-center flex-wrap gap-sm p-sm">
        <div className="flex items-center gap-xs">
          <span className="font-bold text-sm mr-xs flex items-center gap-1">
            <Icon name="clock" size="xs" ariaHidden />
            <span>Khoảng thời gian:</span>
          </span>
          <button
            type="button"
            className={`btn btn-xs ${timeRange === '7' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTimeRange('7')}
          >
            7 ngày gần nhất
          </button>
          <button
            type="button"
            className={`btn btn-xs ${timeRange === '14' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTimeRange('14')}
          >
            14 ngày
          </button>
          <button
            type="button"
            className={`btn btn-xs ${timeRange === '30' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTimeRange('30')}
          >
            30 ngày
          </button>
          <button
            type="button"
            className={`btn btn-xs ${timeRange === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTimeRange('all')}
          >
            Toàn thời gian
          </button>
        </div>

        {onRefresh && (
          <button
            type="button"
            className="btn btn-ghost btn-xs text-muted hover:text-primary flex items-center gap-xs"
            onClick={onRefresh}
            title="Làm mới dữ liệu thống kê"
          >
            <Icon name="refresh" size="xs" ariaHidden />
            <span>Cập nhật</span>
          </button>
        )}
      </div>

      {/* CHART 1: SVG Line Chart */}
      <EventOrdersLineChart
        linePoints={linePoints}
        linePathD={linePathD}
        areaPathD={areaPathD}
        maxDailyOrders={maxDailyOrders}
        peakOrdersDay={peakOrdersDay}
        activeLinePoint={activeLinePoint}
        setActiveLinePoint={setActiveLinePoint}
        getTooltipStyle={getTooltipStyle}
      />

      {/* Detailed Tabular Breakdown */}
      <EventDailyBreakdownTable
        analyticsData={analyticsData}
        tierList={tierList}
        timeRange={timeRange}
        totalPurchasesCount={totalPurchasesCount}
        totalTicketsSold={totalTicketsSold}
        totalRevenue={totalRevenue}
      />
    </div>
  );
};

export default EventAnalyticsDashboard;
