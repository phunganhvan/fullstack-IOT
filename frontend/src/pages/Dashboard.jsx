import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Button, Spin, Switch, notification, Modal, Input, Select, InputNumber } from 'antd';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import usePageClock from '../hooks/usePageClock';
import {
  getDashboard,
  controlDevice,
  addSensor,
  addDevice,
  // deleteSensor as deleteSensorApi,
  // deleteDevice as deleteDeviceApi,
} from '../services/api';
import {
  BulbOutlined,
  CheckCircleFilled, CloseCircleFilled,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import './Dashboard.scss';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFan } from '@fortawesome/free-solid-svg-icons';
import { faTemperatureArrowUp } from '@fortawesome/free-solid-svg-icons'

const POLL_INTERVAL = 2000;
const DEVICE_MIN_LOADING_MS = 3000;
const TRANSITION_TICK_MS = 120;
const NOTIFICATION_TOP = 20;
const NOTIFICATION_MAX_COUNT = 4;
const SENSOR_FALLBACK_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ec4899', '#14b8a6'];
// symbols: bulb, fan, ac
const DASHBOARD_ICON_MAP = {
  bulb: <BulbOutlined />,
  fan: <FontAwesomeIcon icon={faFan} />,
  ac: <FontAwesomeIcon icon={faTemperatureArrowUp} />,
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

function showSimpleNotification(notificationApi, type, message, description) {
  notificationApi.open({
    message,
    description,
    placement: 'topRight',
    duration: type === 'success' ? 3.2 : 4.2,
    className: `device-toast ${type === 'success' ? 'device-toast--success' : 'device-toast--error'}`,
    icon: type === 'success'
      ? <CheckCircleFilled className="device-toast-icon device-toast-icon--success" />
      : <CloseCircleFilled className="device-toast-icon device-toast-icon--error" />,
  });
}

function pickFallbackColor(index = 0) {
  return SENSOR_FALLBACK_COLORS[index % SENSOR_FALLBACK_COLORS.length];
}

function getSensorIconByLabel(label = '', key = '') {
  const text = `${label} ${key}`.toLowerCase();
  if (text.includes('temp')) return '🌡';
  if (text.includes('humid')) return '💧';
  if (text.includes('light') || text.includes('lux')) return '☀️';
  return '📈';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getSensorBarConfig(sensorKey = '', label = '', value = 0, fallbackColor = '#6366f1') {
  const text = `${sensorKey} ${label}`.toLowerCase();
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;

  let maxValue = 100;
  let hue = 240;

  if (text.includes('temp')) {
    maxValue = 50;
    hue = 8;
  } else if (text.includes('humid')) {
    maxValue = 100;
    hue = 208;
  } else if (text.includes('light') || text.includes('lux')) {
    maxValue = 1000;
    hue = 44;
  }

  const ratio = clamp(numericValue / maxValue, 0, 1);
  const width = clamp(Math.round(ratio * 100), 4, 100);

  const startLightness = clamp(82 - ratio * 22, 52, 82);
  const midLightness = clamp(68 - ratio * 20, 38, 70);
  const endLightness = clamp(54 - ratio * 18, 28, 58);

  const gradient = `linear-gradient(90deg, hsl(${hue} 92% ${startLightness}%), hsl(${hue} 94% ${midLightness}%), hsl(${hue} 96% ${endLightness}%))`;

  return {
    width,
    background: gradient,
    shadowColor: fallbackColor,
  };
}

function buildDefaultSensorCards(data) {
  const fallback = data?.sensors || {
    temperature: { value: '--', trend: '', status: 'Normal' },
    humidity: { value: '--', trend: '', status: 'Normal' },
    lightIntensity: { value: '--', trend: '', status: 'Normal' },
  };

  return [
    {
      key: 'temperature',
      label: 'Temperature',
      unit: '°C',
      value: fallback.temperature.value,
      trend: fallback.temperature.trend,
      status: fallback.temperature.status,
      chartColor: '#ef4444',
      icon: '🌡',
      isSimulated: false,
    },
    {
      key: 'humidity',
      label: 'Humidity',
      unit: '%',
      value: fallback.humidity.value,
      trend: fallback.humidity.trend,
      status: fallback.humidity.status,
      chartColor: '#3b82f6',
      icon: '💧',
      isSimulated: false,
    },
    {
      key: 'light',
      label: 'Light Intensity',
      unit: 'Lux',
      value: fallback.lightIntensity.value,
      trend: fallback.lightIntensity.trend,
      status: fallback.lightIntensity.status,
      chartColor: '#f59e0b',
      icon: '☀️',
      isSimulated: false,
    },
  ];
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
function SensorCard({
  sensorKey,
  icon,
  label,
  value,
  unit,
  trend,
  trendColor,
  barColor,
  status,
  isSimulated,
  canDelete,
  deleting,
  onDelete,
}) {
  const statusText = String(status || 'Normal');
  const barConfig = getSensorBarConfig(sensorKey, label, value, barColor);

  return (
    <div className="sensor-card">
      {canDelete && (
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          className="sensor-delete-btn"
          loading={deleting}
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.();
          }}
        />
      )}
      {trend && (
        <span className="sensor-trend" style={{ color: trendColor }}>{trend}</span>
      )}
      <div className="sensor-icon">{icon}</div>
      <div className="sensor-label">{label}</div>
      {isSimulated && <div className="sensor-chip">Simulated</div>}
      <div className="sensor-value">
        {value}<sup className="sensor-unit">{unit}</sup>
      </div>
      <div className="sensor-status-text">{statusText}</div>
      <div className="sensor-bar">
        <div
          className="sensor-bar-fill"
          style={{
            width: `${barConfig.width}%`,
            background: barConfig.background,
            boxShadow: `0 0 10px ${barConfig.shadowColor}55`,
          }}
        />
      </div>
    </div>
  );
}

// Device toggle card with minimum 5s loading and device-specific animation states.
function DeviceCard({
  icon,
  name,
  deviceType,
  uiState,
  onChange,
  isSimulated,
  canDelete,
  deleting,
  onDelete,
}) {
  const cardClassName = [
    'device-card',
    'device-card--interactive',
    `device-card--${deviceType}`,
    uiState.highlight ? 'device-card--highlighted' : '',
    uiState.isLoading ? 'device-card--busy' : '',
  ].filter(Boolean).join(' ');

  const visualClassName = [
    'device-visual',
    `device-visual--${deviceType}`,
    `device-visual-state--${uiState.visualState}`,
  ].join(' ');

  const handleCardToggle = () => {
    if (uiState.isLoading) return;
    onChange?.();
  };

  return (
    <div
      className={cardClassName}
      role="button"
      tabIndex={uiState.isLoading ? -1 : 0}
      aria-pressed={uiState.switchChecked}
      aria-disabled={uiState.isLoading}
      onClick={uiState.isLoading ? undefined : handleCardToggle}
      onKeyDown={(event) => {
        if (uiState.isLoading) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handleCardToggle();
        }
      }}
    >
      <div className={visualClassName}>{icon}</div>
      <div className="device-info">
        <div className="device-name">{name}</div>
        <div className={`device-status ${uiState.statusClass}`}>
          {uiState.statusText}
        </div>
        {isSimulated && <div className="device-note">Simulated device</div>}
      </div>
      <div className="device-controls">
        {canDelete && (
          <Button
            type="text"
            danger
            size="small"
            icon={<DeleteOutlined />}
            className="device-delete-btn"
            loading={deleting}
            disabled={uiState.isLoading || deleting}
            onClick={(event) => {
              event.stopPropagation();
              onDelete?.();
            }}
          />
        )}
        <Switch
          checked={uiState.switchChecked}
          onChange={onChange}
          onClick={(_, event) => event?.stopPropagation?.()}
          loading={uiState.isLoading}
          disabled={uiState.isLoading}
          style={{ background: uiState.switchChecked ? '#6366f1' : undefined }}
          className="device-switch"
          size="small"
        />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [deviceTransitions, setDeviceTransitions] = useState({});
  const [transitionNow, setTransitionNow] = useState(Date.now());
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState('');
  const [notificationApi, notificationContextHolder] = notification.useNotification();
  const [addSensorOpen, setAddSensorOpen] = useState(false);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [sensorSubmitting, setSensorSubmitting] = useState(false);
  const [deviceSubmitting, setDeviceSubmitting] = useState(false);
  // const [deletingSensorMap, setDeletingSensorMap] = useState({});
  // const [deletingDeviceMap, setDeletingDeviceMap] = useState({});

  const [sensorDraft, setSensorDraft] = useState({
    name: '',
    unit: 'unit',
    randomMin: 0,
    randomMax: 100,
    chartColor: '#8b5cf6',
  });
  const [deviceDraft, setDeviceDraft] = useState({
    name: '',
    label: '',
    dashboardType: 'bulb',
  });
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

  const sensorCards = useMemo(() => {
    if (Array.isArray(data?.sensorCards) && data.sensorCards.length) {
      return data.sensorCards.map((item, index) => ({
        ...item,
        chartColor: item.chartColor || pickFallbackColor(index),
        icon: item.icon || getSensorIconByLabel(item.label, item.key),
      }));
    }
    return buildDefaultSensorCards(data);
  }, [data]);

  const chartSeries = useMemo(() => {
    if (Array.isArray(data?.chartSeries) && data.chartSeries.length) {
      return data.chartSeries.map((item, index) => ({
        ...item,
        color: item.color || pickFallbackColor(index),
        yAxisId: item.yAxisId || 'left',
      }));
    }

    return [
      { key: 'temperature', name: 'Temperature', color: '#ef4444', yAxisId: 'left' },
      { key: 'humidity', name: 'Humidity', color: '#3b82f6', yAxisId: 'left' },
      { key: 'light', name: 'Light', color: '#f59e0b', yAxisId: 'right', strokeDasharray: '6 3' },
    ];
  }, [data]);

  useEffect(() => {
    if (!Object.keys(deviceTransitions).length) return;

    const resolvedTransitions = Object.entries(deviceTransitions)
      .map(([deviceName, transition]) => {
        const serverStatus = normalizeDeviceStatus(data?.devices?.[deviceName]?.status);
        const minLoadingDone = transitionNow - transition.startedAt >= DEVICE_MIN_LOADING_MS;

        if (serverStatus === 'loading' || !minLoadingDone) {
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
    if (normalizedCurrentStatus === 'loading') return;

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
  // const handleAddSensor = async () => {
  //   const name = String(sensorDraft.name || '').trim();
  //   const unit = String(sensorDraft.unit || '').trim() || 'unit';
  //   const randomMin = Number(sensorDraft.randomMin);
  //   const randomMax = Number(sensorDraft.randomMax);
  //   const chartColor = String(sensorDraft.chartColor || '').trim();

  //   if (!name) {
  //     showSimpleNotification(notificationApi, 'error', 'Missing sensor name', 'Please enter sensor name.');
  //     return;
  //   }

  //   if (!Number.isFinite(randomMin) || !Number.isFinite(randomMax) || randomMax <= randomMin) {
  //     showSimpleNotification(
  //       notificationApi,
  //       'error',
  //       'Invalid range',
  //       'randomMax must be greater than randomMin.'
  //     );
  //     return;
  //   }

  //   setSensorSubmitting(true);
  //   try {
  //     await addSensor({ name, unit, randomMin, randomMax, chartColor });
  //     setAddSensorOpen(false);
  //     setSensorDraft({
  //       name: '',
  //       unit: 'unit',
  //       randomMin: 0,
  //       randomMax: 100,
  //       chartColor: '#8b5cf6',
  //     });
  //     await fetchData();
  //     showSimpleNotification(notificationApi, 'success', 'Sensor added', `${name} has been added successfully.`);
  //   } catch (error) {
  //     showSimpleNotification(
  //       notificationApi,
  //       'error',
  //       'Add sensor failed',
  //       error?.response?.data?.message || 'Unable to add sensor right now.'
  //     );
  //   } finally {
  //     setSensorSubmitting(false);
  //   }
  // };
  // const handleAddDevice = async () => {
  //   const name = String(deviceDraft.name || '').trim();
  //   const label = String(deviceDraft.label || '').trim() || name;
  //   const dashboardType = String(deviceDraft.dashboardType || 'bulb').toLowerCase();

  //   if (!name) {
  //     showSimpleNotification(notificationApi, 'error', 'Missing device name', 'Please enter device name.');
  //     return;
  //   }

  //   setDeviceSubmitting(true);
  //   try {
  //     await addDevice({ name, label, dashboardType });
  //     setAddDeviceOpen(false);
  //     setDeviceDraft({ name: '', label: '', dashboardType: 'bulb' });
  //     await fetchData();
  //     showSimpleNotification(notificationApi, 'success', 'Device added', `${label} is now available for control.`);
  //   } catch (error) {
  //     showSimpleNotification(
  //       notificationApi,
  //       'error',
  //       'Add device failed',
  //       error?.response?.data?.message || 'Unable to add device right now.'
  //     );
  //   } finally {
  //     setDeviceSubmitting(false);
  //   }
  // };

  // const handleDeleteSensor = (sensor) => {
  //   if (!sensor?.isSimulated || !sensor?.key) {
  //     return;
  //   }

  //   const sensorKey = sensor.key;
  //   const sensorLabel = sensor.label || sensorKey;

  //   // Modal.confirm({
  //   //   title: `Delete ${sensorLabel}?`,
  //   //   content: 'This simulated sensor and its collected values will be removed.',
  //   //   okText: 'Delete',
  //   //   okType: 'danger',
  //   //   cancelText: 'Cancel',
  //   //   async onOk() {
  //   //     setDeletingSensorMap((current) => ({ ...current, [sensorKey]: true }));
  //   //     try {
  //   //       await deleteSensorApi(sensorKey);
  //   //       await fetchData();
  //   //       showSimpleNotification(notificationApi, 'success', 'Sensor deleted', `${sensorLabel} was removed successfully.`);
  //   //     } catch (error) {
  //   //       showSimpleNotification(
  //   //         notificationApi,
  //   //         'error',
  //   //         'Delete sensor failed',
  //   //         error?.response?.data?.message || 'Unable to delete this sensor right now.'
  //   //       );
  //   //     } finally {
  //   //       setDeletingSensorMap((current) => {
  //   //         const next = { ...current };
  //   //         delete next[sensorKey];
  //   //         return next;
  //   //       });
  //   //     }
  //   //   },
  //   // });
  // };

  // const handleDeleteDevice = (device) => {
  //   if (!device?.isSimulated || !device?.id) {
  //     return;
  //   }

  //   const deviceId = device.id;
  //   const deviceLabel = device.label || deviceId;

  //   Modal.confirm({
  //     title: `Delete ${deviceLabel}?`,
  //     content: 'This simulated device will be removed from the dashboard.',
  //     okText: 'Delete',
  //     okType: 'danger',
  //     cancelText: 'Cancel',
  //     async onOk() {
  //       setDeletingDeviceMap((current) => ({ ...current, [deviceId]: true }));
  //       try {
  //         await deleteDeviceApi(deviceId);
  //         setDeviceTransitions((current) => {
  //           const next = { ...current };
  //           delete next[deviceId];
  //           return next;
  //         });
  //         await fetchData();
  //         showSimpleNotification(notificationApi, 'success', 'Device deleted', `${deviceLabel} was removed successfully.`);
  //       } catch (error) {
  //         showSimpleNotification(
  //           notificationApi,
  //           'error',
  //           'Delete device failed',
  //           error?.response?.data?.message || 'Unable to delete this device right now.'
  //         );
  //       } finally {
  //         setDeletingDeviceMap((current) => {
  //           const next = { ...current };
  //           delete next[deviceId];
  //           return next;
  //         });
  //       }
  //     },
  //   });
  // };

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
        <div className="dash-header-right">
          {/* <div className="dash-header-actions">
            <Button
              type="default"
              icon={<PlusOutlined />}
              className="dashboard-action-btn"
              onClick={() => setAddSensorOpen(true)}
            >
              Add Sensor
            </Button>
            <Button
              type="default"
              icon={<PlusOutlined />}
              className="dashboard-action-btn"
              onClick={() => setAddDeviceOpen(true)}
            >
              Add Device
            </Button>
          </div> */}
          <LiveClock />
        </div>
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
            {sensorCards.map((sensor, index) => (
              <SensorCard
                key={sensor.key || `${sensor.label}-${index}`}
                sensorKey={sensor.key}
                icon={<span className="s-icon">{sensor.icon || '📈'}</span>}
                label={sensor.label}
                value={sensor.value}
                unit={sensor.unit}
                trend={sensor.trend}
                trendColor={sensor.chartColor || pickFallbackColor(index)}
                barColor={sensor.chartColor || pickFallbackColor(index)}
                status={sensor.status}
                isSimulated={sensor.isSimulated}
                canDelete={sensor.isSimulated}
              // deleting={Boolean(deletingSensorMap[sensor.key])}
              // onDelete={() => handleDeleteSensor(sensor)}
              />
            ))}
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
                {chartSeries.map((series, index) => (
                  <Line
                    key={series.key || `${series.name}-${index}`}
                    yAxisId={series.yAxisId || 'left'}
                    type="monotone"
                    dataKey={series.key}
                    stroke={series.color || pickFallbackColor(index)}
                    dot={false}
                    strokeWidth={2}
                    strokeDasharray={series.strokeDasharray || undefined}
                    name={series.name}
                    connectNulls
                  />
                ))}
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
                    isSimulated={device.isSimulated}
                    canDelete={device.isSimulated}
                    // deleting={Boolean(deletingDeviceMap[device.id])}
                    // onDelete={() => handleDeleteDevice(device)}
                    onChange={() => handleToggle(device.id, deviceStatus)}
                  />
                );
              })}
            </div>
          </div>

          {/* <Modal
            title="Add Simulated Sensor"
            open={addSensorOpen}
            onCancel={() => setAddSensorOpen(false)}
            onOk={handleAddSensor}
            confirmLoading={sensorSubmitting}
            okText="Add"
            cancelText="Cancel"
          >
            <div className="dashboard-form-field">
              <span>Sensor Name</span>
              <Input
                placeholder="e.g. Soil Moisture"
                value={sensorDraft.name}
                onChange={(e) => setSensorDraft((cur) => ({ ...cur, name: e.target.value }))}
              />
            </div>
            <div className="dashboard-form-grid">
              <div className="dashboard-form-field">
                <span>Unit</span>
                <Input
                  placeholder="e.g. %"
                  value={sensorDraft.unit}
                  onChange={(e) => setSensorDraft((cur) => ({ ...cur, unit: e.target.value }))}
                />
              </div>
              <div className="dashboard-form-field">
                <span>Color</span>
                <div className="dashboard-color-field">
                  <input
                    type="color"
                    value={sensorDraft.chartColor}
                    onChange={(e) => setSensorDraft((cur) => ({ ...cur, chartColor: e.target.value }))}
                  />
                  <Input
                    value={sensorDraft.chartColor}
                    onChange={(e) => setSensorDraft((cur) => ({ ...cur, chartColor: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="dashboard-form-grid">
              <div className="dashboard-form-field">
                <span>Random Min</span>
                <InputNumber
                  value={sensorDraft.randomMin}
                  onChange={(value) => setSensorDraft((cur) => ({ ...cur, randomMin: Number(value ?? 0) }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div className="dashboard-form-field">
                <span>Random Max</span>
                <InputNumber
                  value={sensorDraft.randomMax}
                  onChange={(value) => setSensorDraft((cur) => ({ ...cur, randomMax: Number(value ?? 100) }))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </Modal> */}

          {/* <Modal
            title="Add Simulated Device"
            open={addDeviceOpen}
            onCancel={() => setAddDeviceOpen(false)}
            onOk={handleAddDevice}
            confirmLoading={deviceSubmitting}
            okText="Add"
            cancelText="Cancel"
          >
            <div className="dashboard-form-field">
              <span>Device Name</span>
              <Input
                placeholder="e.g. led3"
                value={deviceDraft.name}
                onChange={(e) => setDeviceDraft((cur) => ({ ...cur, name: e.target.value }))}
              />
            </div>
            <div className="dashboard-form-field">
              <span>Label</span>
              <Input
                placeholder="e.g. LED 3"
                value={deviceDraft.label}
                onChange={(e) => setDeviceDraft((cur) => ({ ...cur, label: e.target.value }))}
              />
            </div>
            <div className="dashboard-form-field">
              <span>Type</span>
              <Select
                value={deviceDraft.dashboardType}
                onChange={(value) => setDeviceDraft((cur) => ({ ...cur, dashboardType: value }))}
                options={[
                  { value: 'bulb', label: 'Bulb' },
                  { value: 'fan', label: 'Fan' },
                  { value: 'ac', label: 'Air Conditioner' },
                ]}
              />
            </div>
          </Modal> */}
        </>
      )}
    </div>
  );
}
