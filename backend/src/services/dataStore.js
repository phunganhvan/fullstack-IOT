/**
 * In-memory data store.
 * Can be replaced with a real DB (MySQL / MongoDB) later.
 * Keeps both packet-level sensor data and legacy table rows.
 */

function formatCurrentTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getMetricStatus(metric, value) {
  const n = toNumber(value, 0);
  if (metric === 'temperature') {
    return n > 35 ? 'High' : n < 15 ? 'Low' : 'Normal';
  }
  if (metric === 'humidity') {
    return n > 80 ? 'High' : n < 20 ? 'Low' : 'Normal';
  }
  if (metric === 'light') {
    return n > 80 ? 'High' : n < 20 ? 'Low' : 'Normal';
  }
  return 'Normal';
}

function normalizeSensorPacket(packet) {
  const lightRaw = toNullableNumber(packet.light_raw);
  const lightPercent = toNullableNumber(packet.light_percent);
  const light = lightPercent !== null ? lightPercent : (lightRaw !== null ? lightRaw : toNumber(packet.light, 0));

  return {
    id: packet.id || `pkt_${Date.now()}`,
    sensor_id: packet.sensor_id || 'UNKNOWN_SENSOR',
    temperature: toNumber(packet.temperature, 0),
    humidity: toNumber(packet.humidity, 0),
    light,
    light_raw: lightRaw,
    light_percent: lightPercent,
    light_digital: toNullableNumber(packet.light_digital),
    is_dark: Boolean(packet.is_dark),
    hw_timestamp: packet.hw_timestamp ?? null,
    timestamp: packet.timestamp || formatCurrentTime(),
  };
}

function buildLegacyRows(packet) {
  const lightUsesPercent = packet.light_percent !== null && packet.light_percent !== undefined;
  return [
    {
      id: `${packet.id}-temp`,
      sensor_id: packet.sensor_id,
      sensor_name: 'Temperature',
      value: packet.temperature,
      unit: '°C',
      timestamp: packet.timestamp,
      status: getMetricStatus('temperature', packet.temperature),
    },
    {
      id: `${packet.id}-humid`,
      sensor_id: packet.sensor_id,
      sensor_name: 'Humidity',
      value: packet.humidity,
      unit: '%',
      timestamp: packet.timestamp,
      status: getMetricStatus('humidity', packet.humidity),
    },
    {
      id: `${packet.id}-light`,
      sensor_id: packet.sensor_id,
      sensor_name: 'Light Sensor',
      value: lightUsesPercent ? packet.light_percent : packet.light,
      unit: lightUsesPercent ? '%' : 'Lux',
      timestamp: packet.timestamp,
      status: getMetricStatus('light', lightUsesPercent ? packet.light_percent : packet.light),
    },
  ];
}

function updateLatestSensorValues(packet) {
  latestSensorValues.temperature = {
    value: packet.temperature,
    trend: '',
    status: getMetricStatus('temperature', packet.temperature),
  };
  latestSensorValues.humidity = {
    value: packet.humidity,
    trend: '',
    status: getMetricStatus('humidity', packet.humidity),
  };
  latestSensorValues.lightIntensity = {
    value: packet.light,
    trend: '',
    status: getMetricStatus('light', packet.light),
  };
}

// ── Sensor packets from hardware ─────────────────────────────────────────────
let sensorPackets = [
  normalizeSensorPacket({
    id: '68fe49ac7f6b6ea48d797f81',
    sensor_id: 'ESP32_001',
    temperature: 24.5,
    humidity: 45,
    light_raw: 1379,
    light_percent: 33,
    light_digital: 0,
    is_dark: false,
    hw_timestamp: 240520,
    timestamp: '2023-10-25 10:42:15',
  }),
  normalizeSensorPacket({
    id: '68fe49ac7f6b6ea48d797f82',
    sensor_id: 'ESP32_001',
    temperature: 23.8,
    humidity: 46,
    light_raw: 1450,
    light_percent: 36,
    light_digital: 0,
    is_dark: false,
    hw_timestamp: 240505,
    timestamp: '2023-10-25 10:30:22',
  }),
  normalizeSensorPacket({
    id: '68fe49ac7f6b6ea48d797f83',
    sensor_id: 'ESP32_001',
    temperature: 24.0,
    humidity: 44,
    light_raw: 1300,
    light_percent: 31,
    light_digital: 0,
    is_dark: false,
    hw_timestamp: 240445,
    timestamp: '2023-10-25 10:15:45',
  }),
];

// Legacy rows for current table UI
let sensorData = sensorPackets.flatMap(buildLegacyRows);

// ── Action / device history ───────────────────────────────────────────────────
let actionData = [
  { id: '68fe49ac7f6b6ea48d797f90', sensor_name: 'Living Room Light', value: 'Turn ON',  timestamp: '2023-10-25 10:45:12', status: 'ON' },
  { id: '68fe49ac7f6b6ea48d797f91', sensor_name: 'Air Conditioner',   value: 'Turn ON',  timestamp: '2023-10-25 10:42:05', status: 'ON' },
  { id: '68fe49ac7f6b6ea48d797f92', sensor_name: 'Fan',               value: 'Turn OFF', timestamp: '2023-10-25 10:38:30', status: 'OFF' },
  { id: '68fe49ac7f6b6ea48d797f903',sensor_name: 'Bedroom Light',     value: 'Turn ON',  timestamp: '2023-10-25 10:35:15', status: 'ON' },
  { id: '68fe49ac7f6b6ea48d797f94', sensor_name: 'Living Room Light', value: 'Turn ON',  timestamp: '2023-10-25 10:30:00', status: 'Loading' },
  { id: '68fe49ac7f6b6ea48d797f95', sensor_name: 'Bedroom Light',     value: 'Turn OFF', timestamp: '2023-10-25 06:00:00', status: 'OFF' },
  { id: '68fe49ac7f6b6ea48d797f96', sensor_name: 'Air Conditioner',   value: 'Turn ON',  timestamp: '2023-10-24 22:15:00', status: 'ON' },
];

// ── Device states ─────────────────────────────────────────────────────────────
let deviceStates = {
  'Living Room Light': true,
  'Kitchen Light':     true,
  'Ceiling Fan':       true,
  'Air Conditioner':   true,
};

// ── Latest sensor values (for dashboard cards) ────────────────────────────────
let latestSensorValues = {
  temperature:  { value: 27,   trend: '+2%',  status: 'Normal' },
  humidity:     { value: 55,   trend: '-1%',  status: 'Normal' },
  lightIntensity:{ value: 430, trend: '+5%',  status: 'Normal' },
};

if (sensorPackets.length > 0) {
  updateLatestSensorValues(sensorPackets[0]);
}

// ── Chart data (24h) ──────────────────────────────────────────────────────────
function generateChartData() {
  const hours = [];
  for (let h = 0; h < 24; h++) {
    const hStr = h.toString().padStart(2, '0') + ':00';
    hours.push({
      time: hStr,
      temperature: Math.round(15 + Math.sin((h / 24) * Math.PI) * 20 + Math.random() * 3),
      humidity:    Math.round(35 + Math.sin((h / 24) * Math.PI * 1.3) * 25 + Math.random() * 3),
      light:       Math.round(200 + Math.sin((h / 24) * Math.PI * 0.9) * 600 + Math.random() * 30),
    });
  }
  return hours;
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────
function getSensorData() { return [...sensorData]; }

function getSensorPackets() { return [...sensorPackets]; }

function getLatestSensorPacket() {
  return sensorPackets.length > 0 ? { ...sensorPackets[0] } : null;
}

function addSensorData(entry) {
  const normalized = {
    ...entry,
    timestamp: entry.timestamp || formatCurrentTime(),
  };
  sensorData.unshift(normalized);
  if (sensorData.length > 500) sensorData.pop();

  // Update latest values
  const name = (normalized.sensor_name || '').toLowerCase();
  if (name.includes('temp')) {
    latestSensorValues.temperature = {
      value: parseFloat(normalized.value),
      trend: '',
      status: normalized.status || 'Normal',
    };
  }
  if (name.includes('humid')) {
    latestSensorValues.humidity = {
      value: parseFloat(normalized.value),
      trend: '',
      status: normalized.status || 'Normal',
    };
  }
  if (name.includes('light')) {
    latestSensorValues.lightIntensity = {
      value: parseFloat(normalized.value),
      trend: '',
      status: normalized.status || 'Normal',
    };
  }
}

function addSensorPacket(packet) {
  const normalizedPacket = normalizeSensorPacket(packet);
  sensorPackets.unshift(normalizedPacket);
  if (sensorPackets.length > 500) sensorPackets.pop();

  const legacyRows = buildLegacyRows(normalizedPacket);
  sensorData.unshift(...legacyRows);
  if (sensorData.length > 1500) {
    sensorData = sensorData.slice(0, 1500);
  }

  updateLatestSensorValues(normalizedPacket);
}

function getActionData() { return [...actionData]; }
function addActionData(entry) {
  actionData.unshift(entry);
  if (actionData.length > 500) actionData.pop();
}

function getDeviceStates() { return { ...deviceStates }; }
function setDeviceState(device, state) {
  deviceStates[device] = state;
}

function getLatestSensorValues() { return { ...latestSensorValues }; }
function getChartData() { return generateChartData(); }

module.exports = {
  getSensorData,
  addSensorData,
  getSensorPackets,
  getLatestSensorPacket,
  addSensorPacket,
  getActionData,
  addActionData,
  getDeviceStates,
  setDeviceState,
  getLatestSensorValues,
  getChartData,
};
