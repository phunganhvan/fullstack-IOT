import React from 'react';
import { Table } from 'antd';
import PageHeader from './PageHeader';

export default function TablePageShell({
  title,
  subtitle,
  filters,
  hints,
  tableProps,
}) {
  return (
    <div className="page-root">
      <PageHeader title={title} subtitle={subtitle} />

      <div className="filter-bar">{filters}</div>

      {hints}

      <div className="table-wrap">
        <Table {...tableProps} />
      </div>
    </div>
  );
}