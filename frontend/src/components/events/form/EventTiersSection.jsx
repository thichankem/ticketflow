import React from 'react';

/**
 * EventTiersSection Component
 * Configures initial ticket tiers when creating a new event.
 *
 * @param {Object} props
 * @param {Array} props.tiers - List of ticket tiers
 * @param {Function} props.onAddTier - Handler to append a new tier
 * @param {Function} props.onUpdateTier - Handler to update tier attribute
 * @param {Function} props.onRemoveTier - Handler to delete tier
 * @param {boolean} [props.saving=false] - Form submission state
 */
export const EventTiersSection = ({
  tiers = [],
  onAddTier,
  onUpdateTier,
  onRemoveTier,
  saving = false,
}) => {
  return (
    <div className="card mb-lg p-lg">
      <div className="flex justify-between items-center mb-md">
        <div>
          <h2 className="card-title text-lg font-bold m-0">
            5. Thiết lập Hạng vé ban đầu
          </h2>
          <p className="text-muted text-xs m-0">
            Người mua chọn hạng vé khi mua, xếp chỗ tự do (Open Seating).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onAddTier}
          disabled={saving}
        >
          + Thêm hạng vé
        </button>
      </div>

      <div className="space-y-sm">
        {tiers.map((tier, idx) => (
          <div
            key={tier.id}
            className="card p-md border flex flex-wrap items-center gap-md"
          >
            <span className="font-bold text-muted">#{idx + 1}</span>
            <label htmlFor={`tier-name-${tier.id}`} className="sr-only">
              Tên hạng vé #{idx + 1}
            </label>
            <input
              id={`tier-name-${tier.id}`}
              type="text"
              className="input flex-1"
              style={{ minWidth: '160px' }}
              placeholder="Tên hạng vé (VD: VIP, Standard)"
              value={tier.name}
              onChange={(e) => onUpdateTier(tier.id, 'name', e.target.value)}
              required
              disabled={saving}
            />

            <label htmlFor={`tier-type-${tier.id}`} className="sr-only">
              Phân loại hạng vé #{idx + 1}
            </label>
            <select
              id={`tier-type-${tier.id}`}
              className="select"
              style={{ width: '130px' }}
              value={tier.type}
              onChange={(e) => onUpdateTier(tier.id, 'type', e.target.value)}
              disabled={saving}
            >
              <option value="PAID">Vé trả phí</option>
              <option value="FREE">Miễn phí</option>
              <option value="DONATION">Ủng hộ</option>
            </select>

            {tier.type !== 'FREE' && (
              <>
                <label htmlFor={`tier-price-${tier.id}`} className="sr-only">
                  Giá vé #{idx + 1}
                </label>
                <input
                  id={`tier-price-${tier.id}`}
                  type="number"
                  className="input"
                  style={{ width: '130px' }}
                  placeholder="Giá vé (VNĐ)"
                  value={tier.price}
                  onChange={(e) => onUpdateTier(tier.id, 'price', e.target.value)}
                  min="0"
                  step="1000"
                  disabled={saving}
                />
              </>
            )}

            <label htmlFor={`tier-qty-${tier.id}`} className="sr-only">
              Số lượng vé #{idx + 1}
            </label>
            <input
              id={`tier-qty-${tier.id}`}
              type="number"
              className="input"
              style={{ width: '110px' }}
              placeholder="Số lượng"
              value={tier.total_quantity}
              onChange={(e) =>
                onUpdateTier(tier.id, 'total_quantity', e.target.value)
              }
              min="1"
              disabled={saving}
            />

            {tiers.length > 1 && (
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => onRemoveTier(tier.id)}
                disabled={saving}
              >
                Xóa
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default EventTiersSection;
