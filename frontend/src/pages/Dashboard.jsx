import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Button, Spin, Switch, notification } from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import usePageClock from '../hooks/usePageClock';
import { getDashboard, controlDevice } from '../services/api';
import {
  BulbOutlined, AimOutlined, SnippetsOutlined,
  CheckCircleFilled, CloseCircleFilled,
  ReloadOutlined,
} from '@ant-design/icons';
import './Dashboard.scss';

const POLL_INTERVAL = 2000;
const DEVICE_MIN_LOADING_MS = 3000;
const TRANSITION_TICK_MS = 120;
const NOTIFICATION_TOP = 20;
const NOTIFICATION_MAX_COUNT = 4;
// symbols: bulb, fan, ac
const DASHBOARD_ICON_MAP = {
  bulb: <BulbOutlined />,
  fan: <AimOutlined />,
  ac: <SnippetsOutlined />,
};

function normalizeDeviceStatus(status) {
  return ['on', 'off', 'loading'].includes(status) ? status : 'off';
}
// kiểm tra nếu status trả về từ server không phải 'on', 'off', hoặc 'loading', thì mặc định coi như 'off' để tránh lỗi hiển thị và điều khiển thiết bị.

function openDeviceNotification(notificationApi, { type, title, description }) {
  const isSuccess = type === 'success';

  notificationApi.open({
    message: title,
    description,
    placement: 'topRight',
    duration: isSuccess ? 3.8 : 4.8,
    className: `device-toast ${isSuccess ? 'device-toast--success' : 'device-toast--error'}`,
    icon: isSuccess
      ? <CheckCircleFilled className="device-toast-icon device-toast-icon--success" />
      : <CloseCircleFilled className="device-toast-icon device-toast-icon--error" />,
  });
}

function showDeviceNotification(notificationApi, deviceLabelMap, deviceName, requestedAction, isSuccess) {
  const label = deviceLabelMap[deviceName] || deviceName;
  const targetText = requestedAction === 'on' ? 'ON' : 'OFF';

  openDeviceNotification(notificationApi, {
    type: isSuccess ? 'success' : 'error',
    title: isSuccess ? `${label} switched to ${targetText}` : `${label} update failed`,
    description: isSuccess
      ? `Device is now ${targetText}.`
      : `Device did not reach ${targetText}. Please try again.`,
  });
}

function buildDeviceUiState(deviceType, serverStatus, transition, now) {
  const normalizedServerStatus = normalizeDeviceStatus(serverStatus);

  if (!transition && normalizedServerStatus === 'loading') {
    return {
      isLoading: true,
      switchChecked: false,
      highlight: true,
      visualState: 'loading',
      statusClass: 'device-status--busy',
      statusText: 'Loading...',
    };
  }

  if (!transition) {
    return {
      isLoading: false,
      switchChecked: normalizedServerStatus === 'on',
      highlight: normalizedServerStatus === 'on',
      visualState: normalizedServerStatus,
      statusClass: normalizedServerStatus === 'on' ? 'device-status--on' : 'device-status--off',
      statusText: normalizedServerStatus.toUpperCase(),
    };
  }

  const elapsed = now - transition.startedAt;
  const remainingMs = Math.max(0, DEVICE_MIN_LOADING_MS - elapsed);
  const minLoadingDone = elapsed >= DEVICE_MIN_LOADING_MS;
  const previousStatus = normalizeDeviceStatus(transition.previousStatus);
  const requestedAction = transition.requestedAction === 'on' ? 'on' : 'off';
  const serverSettled = normalizedServerStatus !== 'loading';
  const isLoading = !serverSettled || !minLoadingDone;

  if (!isLoading) {
    return {
      isLoading: false,
      switchChecked: normalizedServerStatus === 'on',
      highlight: normalizedServerStatus === 'on',
      visualState: normalizedServerStatus,
      statusClass: normalizedServerStatus === 'on' ? 'device-status--on' : 'device-status--off',
      statusText: normalizedServerStatus.toUpperCase(),
    };
  }

  const visualState = requestedAction === 'on' ? 'loading-on' : 'loading-off';
  const countdown = remainingMs > 0 ? Math.max(1, Math.ceil(remainingMs / 1000)) : null;
  const statusText = countdown
    ? `${requestedAction === 'on' ? 'Turning on' : 'Turning off'}... ${countdown}s`
    : 'Waiting for device...';

  return {
    isLoading: true,
    switchChecked: previousStatus === 'on',
    highlight: previousStatus === 'on' || requestedAction === 'on',
    visualState,
    statusClass: 'device-status--busy',
    statusText,
  };
}

// Clock component
function LiveClock() {
  const now = usePageClock();

  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: '2-digit' });
  return (
    <div className="clock-box">
      <div className="clock-time">{timeStr}</div>
      <div className="clock-date">{dateStr}</div>
    </div>
  );
}

// Sensor card
function SensorCard({ icon, label, value, unit, trend, trendColor, barColor, status }) {
  const numericValue = Number(value);
  const progressWidth = Number.isFinite(numericValue) ? Math.max(0, Math.min(100, numericValue)) : 0;

  return (
    <div className="sensor-card">
      {trend && (
        <span className="sensor-trend" style={{ color: trendColor }}>{trend}</span>
      )}
      <div className="sensor-icon">{icon}</div>
      <div className="sensor-label">{label}</div>
      <div className="sensor-value">
        {value}<sup className="sensor-unit">{unit}</sup>
      </div>
      <div className="sensor-bar">
        <div className="sensor-bar-fill" style={{ background: barColor, width: `${progressWidth}%` }} />
      </div>
    </div>
  );
}

// Device toggle card with minimum 5s loading and device-specific animation states.
function DeviceCard({ icon, name, deviceType, uiState, onChange }) {
  const cardClassName = [
    'device-card',
    `device-card--${deviceType}`,
    uiState.highlight ? 'device-card--highlighted' : '',
    uiState.isLoading ? 'device-card--busy' : '',
  ].filter(Boolean).join(' ');

  const visualClassName = [
    'device-visual',
    `device-visual--${deviceType}`,
    `device-visual-state--${uiState.visualState}`,
  ].join(' ');

  return (
    <div className={cardClassName}>
      <div className={visualClassName}>{icon}</div>
      <div className="device-info">
        <div className="device-name">{name}</div>
        <div className={`device-status ${uiState.statusClass}`}>
          {uiState.statusText}
        </div>
      </div>
      <Switch
        checked={uiState.switchChecked}
        onChange={onChange}
        loading={uiState.isLoading}
        disabled={uiState.isLoading}
        style={{ background: uiState.switchChecked ? '#6366f1' : undefined }}
        className="device-switch"
        size="small"
      />
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [deviceTransitions, setDeviceTransitions] = useState({});
  // hieu ung thiet bi
  const [transitionNow, setTransitionNow] = useState(Date.now());
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState('');
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const initialLoadResolvedRef = useRef(false);

  useEffect(() => {
    notification.config({
      placement: 'topRight',
      top: NOTIFICATION_TOP,
      maxCount: NOTIFICATION_MAX_COUNT,
    });
  }, []);

  const fetchData = useCallback(async ({ showInitialLoader = false } = {}) => {
    if (!initialLoadResolvedRef.current && showInitialLoader) {
      setIsInitialLoading(true);
      setInitialLoadError('');
    }

    try {
      const res = await getDashboard();
      setData(res.data);

      if (!initialLoadResolvedRef.current) {
        initialLoadResolvedRef.current = true;
        setIsInitialLoading(false);
        setInitialLoadError('');
      }
    } catch (e) {
      if (!initialLoadResolvedRef.current) {
        setIsInitialLoading(false);
        setInitialLoadError('Unable to load dashboard data. Please check the backend connection and try again.');
      }
      console.error('Dashboard fetch error', e);
    }
  }, []);

  useEffect(() => {
    fetchData({ showInitialLoader: true });
    const id = setInterval(() => fetchData(), POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    if (!Object.keys(deviceTransitions).length) return undefined;

    const id = setInterval(() => {
      setTransitionNow(Date.now());
    }, TRANSITION_TICK_MS);

    return () => clearInterval(id);
  }, [deviceTransitions]);

  const devices = useMemo(() => data?.devices || {}, [data]);
  const deviceList = useMemo(() => {
    if (Array.isArray(data?.deviceList) && data.deviceList.length) {
      return data.deviceList;
    }

    return Object.keys(devices).map((id) => ({
      id,
      label: id,
      dashboardType: 'bulb',
      dashboardIcon: 'bulb',
    }));
  }, [data?.deviceList, devices]);

  const deviceLabelMap = useMemo(
    () => Object.fromEntries(deviceList.map((device) => [device.id, device.label])),
    [deviceList]
  );

  useEffect(() => {
    if (!Object.keys(deviceTransitions).length) return;

    const resolvedTransitions = Object.entries(deviceTransitions)
      .map(([deviceName, transition]) => {
        const serverStatus = normalizeDeviceStatus(data?.devices?.[deviceName]?.status);
        const minLoadingDone = transitionNow - transition.startedAt >= DEVICE_MIN_LOADING_MS;

        if (serverStatus === 'waiting' || !minLoadingDone) {
          return null;
        }

        return {
          deviceName,
          requestedAction: transition.requestedAction,
          isSuccess: serverStatus === transition.requestedAction,
        };
      })
      .filter(Boolean);

    if (!resolvedTransitions.length) {
      return;
    }

    resolvedTransitions.forEach(({ deviceName, requestedAction, isSuccess }) => {
      showDeviceNotification(notificationApi, deviceLabelMap, deviceName, requestedAction, isSuccess);
    });

    setDeviceTransitions((current) => {
      const next = { ...current };
      resolvedTransitions.forEach(({ deviceName }) => {
        delete next[deviceName];
      });
      return next;
    });
  }, [data, transitionNow, deviceTransitions, notificationApi, deviceLabelMap]);

  const handleToggle = async (deviceName, currentStatus) => {
    if (deviceTransitions[deviceName]) return;

    const normalizedCurrentStatus = normalizeDeviceStatus(currentStatus);
    if (normalizedCurrentStatus === 'waiting') return;

    const action = normalizedCurrentStatus === 'on' ? 'off' : 'on';

    setDeviceTransitions((current) => ({
      ...current,
      [deviceName]: {
        startedAt: Date.now(),
        previousStatus: normalizedCurrentStatus,
        requestedAction: action,
      },
    }));

    try {
      await controlDevice(deviceName, action);
      await fetchData();
    } catch (e) {
      setDeviceTransitions((current) => {
        const next = { ...current };
        delete next[deviceName];
        return next;
      });
      openDeviceNotification(notificationApi, {
        type: 'error',
        title: `${deviceLabelMap[deviceName] || deviceName} request failed`,
        description: e?.response?.data?.message || 'Unable to control this device right now.',
      });
      await fetchData();
      console.error('Device control error', e);
    }
  };

  const sensors = data?.sensors || {
    temperature:    { value: '--', trend: '', status: 'Normal' },
    humidity:       { value: '--', trend: '', status: 'Normal' },
    lightIntensity: { value: '--', trend: '', status: 'Normal' },
  };
  const chartData = data?.chartData || [];

  const showInitialPanel = isInitialLoading || (!!initialLoadError && !data);

  return (
    <div className="dashboard-root">
      {notificationContextHolder}
      {/* Header */}
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Dashboard Overview</h1>
          <p className="dash-subtitle">Real-time monitoring and control system</p>
        </div>
        <LiveClock />
      </div>

      {showInitialPanel ? (
        <div className="dashboard-loading-shell">
          <div className="dashboard-loading-card">
            {isInitialLoading ? (
              <>
                <Spin size="large" />
                <div className="dashboard-loading-title">Loading dashboard</div>
                <div className="dashboard-loading-text">Waiting for the latest sensor values and device states...</div>
              </>
            ) : (
              <>
                <div className="dashboard-loading-title">Dashboard unavailable</div>
                <div className="dashboard-loading-text">{initialLoadError}</div>
                <Button
                  type="default"
                  icon={<ReloadOutlined />}
                  onClick={() => fetchData({ showInitialLoader: true })}
                  className="dashboard-retry-btn"
                >
                  Retry
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>

          {/* Sensor cards row */}
          <div className="sensor-row">
            <SensorCard
              icon={<span className="s-icon temp-icon">🌡</span>}
              label="Temperature"
              value={sensors.temperature.value}
              unit="°C"
              trend={sensors.temperature.trend}
              trendColor="#f87171"
              barColor="#ef4444"
            />
            <SensorCard
              icon={<span className="s-icon humid-icon">💧</span>}
              label="Humidity"
              value={sensors.humidity.value}
              unit="%"
              trend={sensors.humidity.trend}
              trendColor="#60a5fa"
              barColor="#3b82f6"
            />
            <SensorCard
              icon={<span className="s-icon light-icon">☀️</span>}
              label="Light Intensity"
              value={sensors.lightIntensity.value}
              unit="Lux"
              trend={sensors.lightIntensity.trend}
              trendColor="#fbbf24"
              barColor="#f59e0b"
              status={sensors.lightIntensity.status}
              statusTag
            />
          </div>

          {/* Chart */}
          <div className="chart-section">
            <div className="chart-title">Sensor Trends (2s refresh, 6 samples each)</div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2140" />
                <XAxis dataKey="time" stroke="#4b5563" tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickFormatter={v => String(v || '').substring(0, 8)} interval={0} />
                <YAxis yAxisId="left" stroke="#4b5563" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" stroke="#4b5563" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#1a1d35', border: '1px solid #2d3050', borderRadius: 8, color: '#fff' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Legend wrapperStyle={{ color: '#9ca3af', paddingTop: 4, fontSize: 12 }} />
                <Line yAxisId="left"  type="monotone" dataKey="temperature" stroke="#ef4444" dot={false} strokeWidth={2} name="Temp" />
                <Line yAxisId="left"  type="monotone" dataKey="humidity"    stroke="#3b82f6" dot={false} strokeWidth={2} name="Humidity" />
                <Line yAxisId="right" type="monotone" dataKey="light"       stroke="#f59e0b" dot={false} strokeWidth={2} strokeDasharray="6 3" name="Light" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Device controls */}
          <div className="device-section">
            <div className="device-section-title">Device Controls</div>
            <div className="device-row">
              {deviceList.map((device) => {
                const deviceStatus = devices[device.id]?.status || 'off';
                const deviceType = device.dashboardType || 'bulb';
                const iconKey = device.dashboardIcon || 'bulb';
                const uiState = buildDeviceUiState(
                  deviceType,
                  deviceStatus,
                  deviceTransitions[device.id],
                  transitionNow
                );

                return (
                  <DeviceCard
                    key={device.id}
                    icon={DASHBOARD_ICON_MAP[iconKey] || <BulbOutlined />}
                    name={device.label}
                    deviceType={deviceType}
                    uiState={uiState}
                    onChange={() => handleToggle(device.id, deviceStatus)}
                  />
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
