import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Input, Select, Button, message } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import StatusBadge from '../components/common/StatusBadge';
import TablePageShell from '../components/common/TablePageShell';
import { getActions } from '../services/api';
import { isValidPartialDateTime, PARTIAL_DATE_TIME_PLACEHOLDER } from '../utils/dateTimeSearch';
import './PageTable.scss';

const { Option } = Select;

const DATA_TYPE_OPTIONS = ['action_time', 'action'];
const LIMIT_OPTIONS = [7, 10, 20, 50];

function normalizeDataType(value) {
  return DATA_TYPE_OPTIONS.includes(value) ? value : 'action';
}

function normalizeDevice(value, availableDeviceValues = []) {
  const normalized = String(value || 'all');
  if (normalized === 'all') return 'all';
  return availableDeviceValues.includes(normalized) ? normalized : 'all';
}

function isSearchValid(dataType, searchText) {
  const trimmed = String(searchText || '').trim();
  if (!trimmed) return true;

  if (dataType === 'action') {
    const action = trimmed.toLowerCase();
    return action === 'on' || action === 'off';
  }

  return isValidPartialDateTime(trimmed);
}

const STATUS_COLOR = {
  LOADING: { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: '#f59e0b' },
  SUCCESS: { color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: '#10b981' },
  ERROR:   { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', border: '#ef4444' },
};

export default function ActionHistory() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tableData, setTableData]   = useState([]);
  const [deviceList, setDeviceList] = useState([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(false);
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(10);
  const [search, setSearch]         = useState(() => searchParams.get('search') || '');
  const [dataType, setDataType]     = useState(() => normalizeDataType(searchParams.get('dataType')));
  const [device, setDevice]         = useState(() => normalizeDevice(searchParams.get('device')));
  const [order, setOrder]           = useState(() => {
    const qOrder = searchParams.get('order');
    return ['asc', 'desc'].includes(qOrder) ? qOrder : 'desc';
  });

  const availableDeviceValues = useMemo(
    () => deviceList.map((deviceItem) => deviceItem.id),
    [deviceList]
  );

  const deviceOptions = useMemo(
    () => [
      { value: 'all', label: 'All devices' },
      ...deviceList.map((deviceItem) => ({ value: deviceItem.id, label: deviceItem.label })),
    ],
    [deviceList]
  );

  const deviceIconByLabel = useMemo(
    () => Object.fromEntries(
      deviceList.map((deviceItem) => [deviceItem.label, deviceItem.actionIcon || '🔧'])
    ),
    [deviceList]
  );

  useEffect(() => {
    setDevice((current) => normalizeDevice(current, availableDeviceValues));
  }, [availableDeviceValues]);

  useEffect(() => {
    const next = new URLSearchParams();
    next.set('search', search);
    next.set('dataType', dataType);
    next.set('device', device);
    next.set('order', order);
    setSearchParams(next, { replace: true });
  }, [search, dataType, device, order, setSearchParams]);

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
      const res = await getActions({
        page,
        limit,
        search: trimmedSearch,
        dataType,
        device,
        order,
      });
      const incomingDeviceList = Array.isArray(res.data.deviceList) ? res.data.deviceList : [];
      setDeviceList(incomingDeviceList);
      setTableData(res.data.data);
      setTotal(res.data.total);
    } catch (e) {
      message.error(e?.response?.data?.message || 'Failed to load action history');
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, dataType, device, order]);

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
          <span className="cell-sensor-icon">{deviceIconByLabel[v] || '🔧'}</span>
          {v}
        </span>
      ),
    },
    {
      title: 'VALUE',
      dataIndex: 'value',
      render: v => <span className="cell-value-bold">{v}</span>,
    },
    {
      title: 'TIMESTAMP',
      dataIndex: 'timestamp',
    },
    {
      title: 'STATUS',
      dataIndex: 'status',
      render: (v) => {
        const normalizedStatus = String(v || '').toUpperCase();
        return <StatusBadge status={normalizedStatus} palette={STATUS_COLOR} fallbackKey="ERROR" />;
      },
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
        <Option value="action_time">Action Time</Option>
        <Option value="action">Action</Option>
      </Select>

      <Input
        prefix={<SearchOutlined style={{ color: '#6b7280' }} />}
        placeholder={
          dataType === 'action_time'
            ? PARTIAL_DATE_TIME_PLACEHOLDER : 'Action value: on / off'
        }
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="filter-input"
      />

      <Select
        value={device}
        onChange={v => { setDevice(v); setPage(1); }}
        className="filter-select ml-auto"
        popupClassName="dark-dropdown"
        placeholder="All devices"
      >
        {deviceOptions.map((option) => (
          <Option key={option.value} value={option.value}>{option.label}</Option>
        ))}
      </Select>

      <Select
        value={'timestamp_' + order}
        onChange={v => { setOrder(v.split('_')[1]); setPage(1); }}
        className="filter-select"
        popupClassName="dark-dropdown"
      >
        <Option value="timestamp_desc">Sort: Newest</Option>
        <Option value="timestamp_asc">Sort: Oldest</Option>
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
      {dataType === 'action_time' && (
        <div className="filter-hint">Action Time format: {PARTIAL_DATE_TIME_PLACEHOLDER}.</div>
      )}

      {dataType === 'action' && search.trim() && !['on', 'off'].includes(search.trim().toLowerCase()) && (
        <div className="filter-hint filter-hint-error">Action must be exactly on or off.</div>
      )}

      {dataType === 'action_time' && search.trim() && !isValidPartialDateTime(search.trim()) && (
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
      title="Action History"
      subtitle="Track user interactions and device state changes"
      filters={filterControls}
      hints={filterHints}
      tableProps={tableProps}
    />
  );
}
