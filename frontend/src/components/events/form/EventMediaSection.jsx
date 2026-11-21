import React from 'react';
import { ImageUploader } from '../../ImageUploader';

/**
 * EventMediaSection Component
 * Provides upload controls for event cover and banner promotional images.
 *
 * @param {Object} props
 * @param {string} props.cover - URL of current cover image
 * @param {string} props.banner - URL of current banner image
 * @param {Function} props.onCoverChange - Callback when cover URL changes
 * @param {Function} props.onBannerChange - Callback when banner URL changes
 * @param {number|string} [props.eventId] - Associated event ID
 */
export const EventMediaSection = ({
  cover = '',
  banner = '',
  onCoverChange,
  onBannerChange,
  eventId = null,
}) => {
  return (
    <div className="card mb-lg p-lg">
      <h2 className="card-title text-lg font-bold mb-md">
        3. Hình ảnh bìa & Banner quảng bá
      </h2>
      <div className="grid grid-2 gap-lg">
        <div>
          <label className="form-label font-semibold mb-xs">
            Ảnh bìa (Cover Image - 1:1 hoặc 4:3)
          </label>
          <ImageUploader
            id="event-cover-uploader"
            value={cover}
            eventId={eventId}
            mediaType="cover"
            aspect="cover"
            onChange={onCoverChange}
          />
        </div>
        <div>
          <label className="form-label font-semibold mb-xs">
            Ảnh biểu ngữ (Banner Image - 16:9)
          </label>
          <ImageUploader
            id="event-banner-uploader"
            value={banner}
            eventId={eventId}
            mediaType="banner"
            aspect="banner"
            onChange={onBannerChange}
          />
        </div>
      </div>
    </div>
  );
};

export default EventMediaSection;
