import React from 'react';

/**
 * Standardized PageHeader component with title, description, and primary/secondary actions.
 */
export const PageHeader = ({
  title,
  subtitle,
  badge,
  actions,
  children,
  className = '',
}) => {
  return (
    <div
      className={`page-header-container ${className}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.5rem',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>{title}</h1>
          {badge}
        </div>
        {subtitle && (
          <p className="text-muted" style={{ margin: '0.35rem 0 0 0', fontSize: '0.95rem' }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>

      {actions && (
        <div
          className="page-header-actions"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
