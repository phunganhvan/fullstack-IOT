import React from 'react';
import usePageClock from '../../hooks/usePageClock';

export default function PageHeader({ title, subtitle }) {
  const now = usePageClock();

  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
      </div>
      <div className="page-time">
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        <br />
        <span style={{ fontSize: 11 }}>{now.toDateString()}</span>
      </div>
    </div>
  );
}