import React from 'react';

/**
 * Reusable, accessible DataTable component with loading, empty state, and pagination.
 */
export const DataTable = ({
  columns = [],
  data = [],
  loading = false,
  emptyMessage = 'Không có dữ liệu',
  page = 1,
  totalPages = 1,
  onPageChange,
  renderRow,
  className = '',
}) => {
  return (
    <div className={`table-container ${className}`}>
      <table className="table">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={col.className || ''}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
                <span className="text-muted">Đang tải dữ liệu...</span>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                style={{ textAlign: 'center', padding: '2.5rem 1rem' }}
                className="text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, idx) => (renderRow ? renderRow(item, idx) : null))
          )}
        </tbody>
      </table>

      {totalPages > 1 && onPageChange && (
        <div
          className="table-pagination"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '1rem',
            borderTop: '1px solid var(--border-color, #e2e8f0)',
          }}
        >
          <span className="text-sm text-muted">
            Trang {page} / {totalPages}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Trang trước
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Trang sau
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
