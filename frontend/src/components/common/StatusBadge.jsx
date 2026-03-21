import React from 'react';

export default function StatusBadge({ status, palette, fallbackKey }) {
  const fallback = palette[fallbackKey] || Object.values(palette)[0] || { color: '#fff', bg: 'transparent' };
  const theme = palette[status] || fallback;
  const borderColor = theme.border || theme.color;

  return (
    <span className="status-tag" style={{ color: theme.color, background: theme.bg, border: `1px solid ${borderColor}` }}>
      {status}
    </span>
  );
}