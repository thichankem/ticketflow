import React from 'react';

/**
 * EventBasicSection Component
 * Renders basic event metadata fields: title, category, publication status,
 * province, venue location, start date, end date, and summary description.
 *
 * @param {Object} props
 * @param {Object} props.formData - Form state object
 * @param {Function} props.onChange - Form change handler
 * @param {Array} props.provinces - Available province options
 * @param {boolean} props.isEditing - Whether editing an existing event
 * @param {boolean} props.saving - Form submission pending state
 */
export const EventBasicSection = ({
  formData,
  onChange,
  provinces = [],
  isEditing = false,
  saving = false,
}) => {
  return (
    <div className="card mb-lg p-lg">
      <h2 className="card-title text-lg font-bold mb-md">1. Thông tin cơ bản</h2>
      <div className="grid grid-2 gap-md">
        <div className="form-group">
          <label htmlFor="event-title-input" className="form-label required">
            Tên sự kiện
          </label>
          <input
            id="event-title-input"
            type="text"
            name="title"
            className="input"
            value={formData.title}
            onChange={onChange}
            placeholder="VD: Tech Conference Vietnam 2026"
            required
            disabled={saving}
          />
        </div>

        <div className="form-group">
          <label htmlFor="event-category-select" className="form-label">
            Thể loại sự kiện
          </label>
          <select
            id="event-category-select"
            name="category"
            className="select"
            value={formData.category}
            onChange={onChange}
            disabled={saving}
          >
            <option value="Tech">Công nghệ & Kỹ thuật (Tech)</option>
            <option value="Music">Âm nhạc & Lễ hội (Music)</option>
            <option value="Business">Kinh doanh & Khởi nghiệp (Business)</option>
            <option value="Art">Nghệ thuật & Thiết kế (Art)</option>
            <option value="Sports">Thể thao & Sức khỏe (Sports)</option>
            <option value="Workshop">Workshop & Đào tạo</option>
            <option value="Other">Khác</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="event-status-select" className="form-label">
            Trạng thái phát hành
          </label>
          <select
            id="event-status-select"
            name="status"
            className="select"
            value={formData.status}
            onChange={onChange}
            disabled={saving}
          >
            <option value="LIVE">Mở bán công khai (LIVE)</option>
            <option value="DRAFT">Lưu bản nháp (DRAFT)</option>
            {isEditing && (
              <option value="PAUSED">Tạm ngưng nhận đăng ký (PAUSED)</option>
            )}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="event-province-select" className="form-label">
            Tỉnh / Thành phố tổ chức
          </label>
          <select
            id="event-province-select"
            name="province"
            className="select"
            value={formData.province}
            onChange={onChange}
            disabled={saving}
          >
            {provinces.length > 0 ? (
              provinces.map((p) => (
                <option key={p.name || p} value={p.name || p}>
                  {p.name || p}
                </option>
              ))
            ) : (
              <>
                <option value="Hồ Chí Minh">TP. Hồ Chí Minh</option>
                <option value="Hà Nội">TP. Hà Nội</option>
                <option value="Đà Nẵng">TP. Đà Nẵng</option>
                <option value="Cần Thơ">TP. Cần Thơ</option>
              </>
            )}
          </select>
        </div>

        <div className="form-group col-span-2">
          <label htmlFor="event-location-input" className="form-label">
            Địa điểm cụ thể
          </label>
          <input
            id="event-location-input"
            type="text"
            name="location"
            className="input"
            value={formData.location}
            onChange={onChange}
            placeholder="VD: Trung tâm Hội nghị SECC, 799 Nguyễn Văn Linh, Q.7, TP.HCM"
            disabled={saving}
          />
        </div>

        <div className="form-group">
          <label htmlFor="event-start-date-input" className="form-label">
            Thời gian bắt đầu
          </label>
          <input
            id="event-start-date-input"
            type="datetime-local"
            name="start_date"
            className="input"
            value={formData.start_date}
            onChange={onChange}
            disabled={saving}
          />
        </div>

        <div className="form-group">
          <label htmlFor="event-end-date-input" className="form-label">
            Thời gian kết thúc
          </label>
          <input
            id="event-end-date-input"
            type="datetime-local"
            name="end_date"
            className="input"
            value={formData.end_date}
            onChange={onChange}
            disabled={saving}
          />
        </div>
      </div>

      <div className="form-group mt-md">
        <label
          htmlFor="event-description-textarea"
          className="form-label font-semibold flex items-center justify-between"
        >
          <span>Mô tả ngắn tóm tắt (Hiển thị ở thẻ sự kiện & tìm kiếm)</span>
          <span className="text-xs font-normal text-muted">
            Phần nội dung chi tiết & lịch trình mốc thời gian thiết lập ở Mục 2 bên dưới
          </span>
        </label>
        <textarea
          id="event-description-textarea"
          name="description"
          className="input textarea"
          rows="2"
          value={formData.description}
          onChange={onChange}
          placeholder="Nhập 1-2 câu tóm tắt nhanh để hiển thị ở thẻ sự kiện và kết quả tìm kiếm..."
          disabled={saving}
        />
      </div>
    </div>
  );
};

export default EventBasicSection;
