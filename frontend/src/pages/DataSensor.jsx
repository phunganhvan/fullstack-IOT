import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input, Select, Button, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import StatusBadge from '../components/common/StatusBadge';
import TablePageShell from '../components/common/TablePageShell';
import { getSensors } from '../services/api';
import { isValidPartialDateTime, PARTIAL_DATE_TIME_PLACEHOLDER } from '../utils/dateTimeSearch';
import './PageTable.scss';

const { Option } = Select;

const SENSOR_ICONS = {
  'Temperature':  '🌡',
  'Humidity':     '💧',
  'Light Sensor': '☀️',
};

const STATUS_COLOR = {
  High:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  Low:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  Normal: { color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
};

const DATA_TYPE_OPTIONS = ['sensor_value', 'time_response'];
const SENSOR_TYPE_OPTIONS = ['all', 'Temperature', 'Humidity', 'Light Sensor'];
const LIMIT_OPTIONS = [7, 10, 20, 50];

function normalizeDataType(value) {
  return DATA_TYPE_OPTIONS.includes(value) ? value : 'sensor_value';
}

function normalizeSensorType(value) {
  return SENSOR_TYPE_OPTIONS.includes(value) ? value : 'all';
}

function isSearchValid(dataType, searchText) {
  const trimmed = String(searchText || '').trim();
  if (!trimmed) return true;

  if (dataType === 'sensor_value') {
    return Number.isFinite(Number(trimmed));
  }

  return isValidPartialDateTime(trimmed);
}

export default function DataSensor() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tableData, setTableData]   = useState([]);
  // config table antd
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(10);
  //end config table antd
  
  // param query
  const [search, setSearch]         = useState(() => searchParams.get('search') || '');
  const [dataType, setDataType]     = useState(() => normalizeDataType(searchParams.get('dataType')));
  const [type, setType]             = useState(() => normalizeSensorType(searchParams.get('type')));
  const [sort, setSort]             = useState(() => {
    const qSort = searchParams.get('sort');
    return ['timestamp', 'value'].includes(qSort) ? qSort : 'timestamp';
  });
  const [order, setOrder]           = useState(() => {
    const qOrder = searchParams.get('order');
    return ['asc', 'desc'].includes(qOrder) ? qOrder : 'desc';
  });

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('search', search);
    next.set('dataType', dataType);
    next.set('type', type);
    next.set('sort', sort);
    next.set('order', order);
    setSearchParams(next, { replace: true });
  }, [search, dataType, type, sort, order, setSearchParams]);

  const fetchData = useCallback(async () => {
    const trimmedSearch = String(search || '').trim();
    const validSearch = isSearchValid(dataType, trimmedSearch);

    if (!validSearch) {
      setTableData([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    try {
      const res = await getSensors({
        page,
        limit,
        search: trimmedSearch,
        dataType,
        type,
        sort,
        order,
      });
      setTableData(res.data.data);
      setTotal(res.data.total);
    } catch (e) {
      const errorMessage = e?.response?.data?.message || 'Failed to load sensor data';
      message.error(errorMessage);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, dataType, type, sort, order]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = [
    {
      title: 'STT',
      key: 'stt',
      width: 72,
      align: 'center',
      render: (_, __, index) => (page - 1) * limit + index + 1,
    },
    {
      title: 'ID',
      dataIndex: 'id',
      width: 220,
      render: v => <span className="cell-id">{v}</span>,
    },
    {
      title: 'SENSOR NAME',
      dataIndex: 'sensor_name',
      render: (v) => (
        <span className="cell-sensor">
          <span className="cell-sensor-icon">{SENSOR_ICONS[v] || '🔧'}</span>
          {v}
        </span>
      ),
    },
    {
      title: 'VALUE',
      dataIndex: 'value',
      render: (v, row) => (
        <span className="cell-value-bold">{v} <span className="cell-unit">{row.unit}</span></span>
      ),
    },
    {
      title: 'TIMESTAMP',
      dataIndex: 'timestamp',
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      render: v => <StatusBadge status={v} palette={STATUS_COLOR} fallbackKey="Normal" />,
    },
  ];

  const filterControls = (
    <>
      <Select
        value={dataType}
        onChange={v => { setDataType(v); setSearch(''); setPage(1); }}
        className="filter-select"
        popupClassName="dark-dropdown"
      >
        <Option value="time_response">Time Response</Option>
        <Option value="sensor_value">Sensor Value</Option>
      </Select>

      <Input
        prefix={<SearchOutlined style={{ color: '#6b7280' }} />}
        placeholder={
          dataType === 'time_response'
            ? PARTIAL_DATE_TIME_PLACEHOLDER : 'Exact sensor value (e.g. 27.5)'
        }
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="filter-input"
      />

      <Select
        value={type}
        onChange={v => { setType(v); setPage(1); }}
        className="filter-select ml-auto"
        popupClassName="dark-dropdown"
        placeholder="All sensors"
      >
        <Option value="all">All sensors</Option>
        <Option value="Temperature">Temperature</Option>
        <Option value="Humidity">Humidity</Option>
        <Option value="Light Sensor">Light Sensor</Option>
      </Select>

      <Select
        value={sort + '_' + order}
        onChange={v => {
          const [s, o] = v.split('_');
          setSort(s); setOrder(o); setPage(1);
        }}
        className="filter-select"
        popupClassName="dark-dropdown"
      >
        <Option value="timestamp_desc">Sort: Newest</Option>
        <Option value="timestamp_asc">Sort: Oldest</Option>
        <Option value="value_desc">Value: High → Low</Option>
        <Option value="value_asc">Value: Low → High</Option>
      </Select>

      <Select
        value={limit}
        onChange={v => { setLimit(v); setPage(1); }}
        className="filter-select"
        popupClassName="dark-dropdown"
      >
        {LIMIT_OPTIONS.map((n) => <Option key={n} value={n}>{n}</Option>)}
      </Select>

      <Button icon={<ReloadOutlined />} onClick={fetchData} className="icon-btn" />
    </>
  );

  const filterHints = (
    <>
      {dataType === 'time_response' && (
        <div className="filter-hint">Time Response format: {PARTIAL_DATE_TIME_PLACEHOLDER}.</div>
      )}

      {dataType === 'sensor_value' && search.trim() && !Number.isFinite(Number(search.trim())) && (
        <div className="filter-hint filter-hint-error">Sensor Value must be a number.</div>
      )}

      {dataType === 'time_response' && search.trim() && !isValidPartialDateTime(search.trim()) && (
        <div className="filter-hint filter-hint-error">Invalid format. Use {PARTIAL_DATE_TIME_PLACEHOLDER}.</div>
      )}
    </>
  );

  const tableProps = {
    dataSource: tableData,
    columns,
    rowKey: 'id',
    loading,
    pagination: {
      current: page,
      pageSize: limit,
      total,
      onChange: (p, pageSize) => {
        setPage(p);
        if (pageSize !== limit) setLimit(pageSize);
      },
      showTotal: (t, r) => `Showing ${r[0]} to ${r[1]} of ${t} entries`,
      style: { color: '#9ca3af' },
    },
    className: 'dark-table',
    scroll: { y: 'calc(100vh - 280px)' },
  };

  return (
    <TablePageShell
      title="Data Sensor"
      subtitle="Review historical data and environmental readings"
      filters={filterControls}
      hints={filterHints}
      tableProps={tableProps}
    />
  );
}
