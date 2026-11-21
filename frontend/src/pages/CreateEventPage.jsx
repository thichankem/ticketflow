import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { useLanguage } from '../context/LanguageContext';
import { EventForm } from '../components/events/EventForm';
import { PageHeader } from '../components/common/PageHeader';
import { Icon } from '../components/ui/Icon';

export const CreateEventPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [errorNotice, setErrorNotice] = useState(null);

  const handleSave = async (formData) => {
    setErrorNotice(null);
    try {
      const res = await api.events.create(formData);
      const createdEvent = res?.event || res;
      navigate('/organizer', {
        state: {
          notice: `Sự kiện "${createdEvent.title || formData.title}" đã được tạo thành công!`,
          selectedEventId: createdEvent.id,
        },
      });
    } catch (err) {
      setErrorNotice(err.message || 'Lỗi khi tạo sự kiện. Vui lòng thử lại.');
      throw err;
    }
  };

  return (
    <div className="container py-lg max-w-4xl mx-auto">
      <div className="flex justify-between items-center flex-wrap gap-sm mb-md">
        <Link to="/organizer" className="btn btn-secondary btn-sm inline-flex items-center gap-xs">
          <Icon name="arrow-left" size="xs" ariaHidden />
          <span>{t('common.back', 'Quay lại Studio')}</span>
        </Link>
      </div>

      <PageHeader
        title="Tạo Sự Kiện Mới"
        subtitle="Thiết lập thông tin sự kiện, hình ảnh quảng bá và cấu hình hạng vé mở bán."
      />

      {errorNotice && (
        <div className="alert alert-danger mb-md">
          <span>{errorNotice}</span>
        </div>
      )}

      <EventForm
        includeTiers={true}
        onSave={handleSave}
        onCancel={() => navigate('/organizer')}
      />
    </div>
  );
};

export default CreateEventPage;
