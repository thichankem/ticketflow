import React from 'react';

/**
 * EventRefundSection Component
 * Configures attendee self-service refund policies and window constraints.
 *
 * @param {Object} props
 * @param {boolean} props.allowRefunds - Whether refunds are enabled
 * @param {number} props.refundMaxDays - Maximum days allowed after ticket purchase
 * @param {number} props.refundMinDaysBeforeEvent - Minimum days required before event start date
 * @param {Function} props.onChange - Form change handler
 * @param {boolean} [props.saving=false] - Form submission state
 */
export const EventRefundSection = ({
  allowRefunds = true,
  refundMaxDays = 7,
  refundMinDaysBeforeEvent = 3,
  onChange,
  saving = false,
}) => {
  return (
    <div className="card mb-lg p-lg">
      <h2 className="card-title text-lg font-bold mb-md">
        4. Chính sách hoàn tiền vé
      </h2>
      <div className="grid grid-3 gap-md">
        <div
          className="form-group flex items-center gap-xs"
          style={{ paddingTop: '1.75rem' }}
        >
          <input
            id="event-allow-refunds"
            type="checkbox"
            name="allow_refunds"
            checked={allowRefunds}
            onChange={onChange}
            disabled={saving}
          />
          <label
            htmlFor="event-allow-refunds"
            className="flex items-center gap-xs cursor-pointer"
          >
            <span className="font-semibold">Cho phép người mua hủy vé</span>
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="event-refund-max-days" className="form-label">
            Số ngày tối đa sau khi mua
          </label>
          <input
            id="event-refund-max-days"
            type="number"
            name="refund_max_days"
            className="input"
            placeholder="VD: 7"
            value={refundMaxDays}
            onChange={onChange}
            min="1"
            max="60"
            disabled={saving || !allowRefunds}
          />
          <span className="text-xs text-muted">
            Ví dụ: Được hủy vé trong 7 ngày đầu
          </span>
        </div>

        <div className="form-group">
          <label htmlFor="event-refund-min-days" className="form-label">
            Số ngày tối thiểu trước sự kiện
          </label>
          <input
            id="event-refund-min-days"
            type="number"
            name="refund_min_days_before_event"
            className="input"
            placeholder="VD: 3"
            value={refundMinDaysBeforeEvent}
            onChange={onChange}
            min="0"
            max="30"
            disabled={saving || !allowRefunds}
          />
          <span className="text-xs text-muted">
            Ví dụ: Phải hủy trước giờ G ít nhất 3 ngày
          </span>
        </div>
      </div>
    </div>
  );
};

export default EventRefundSection;
