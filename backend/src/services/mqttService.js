const mqtt = require('mqtt');
const { v4: uuidv4 } = require('uuid');
const store = require('./dataStore');
const DataSensor = require('../model/dataSensor.model');
const ActionHistory = require('../model/actionHistory.model');
const Device = require('../model/device.model');
const Sensor = require('../model/sensor.model');
const { DEVICE_IDS } = require('../constants/devices');
const {
  DASHBOARD_SENSOR_KEYS,
  SENSOR_NAME_MAP,
  normalizeSensorKey,
} = require('../constants/sensors');

let client = null;
let connected = false;
// deviceName (lowercase) -> { timerId, actionHistoryId, previousStatus }
const pendingCommands = new Map();
const parsedPendingTimeout = Number.parseInt(process.env.PENDING_TIMEOUT_MS || '8000', 10);
const PENDING_TIMEOUT_MS = Number.isFinite(parsedPendingTimeout) && parsedPendingTimeout > 0
  ? parsedPendingTimeout
  : 8000;
const parsedHardwareOfflineGap = Number.parseInt(process.env.HW_OFFLINE_GAP_MS || '6000', 10);
const HARDWARE_OFFLINE_GAP_MS = Number.isFinite(parsedHardwareOfflineGap)
  ? Math.max(1000, parsedHardwareOfflineGap)
  : 6000;
const parsedMinSyncInterval = Number.parseInt(process.env.HW_SYNC_MIN_INTERVAL_MS || '3000', 10);
const HW_SYNC_MIN_INTERVAL_MS = Number.isFinite(parsedMinSyncInterval)
  ? Math.max(1000, parsedMinSyncInterval)
  : 3000;

let lastHardwareSeenAt = 0;
let lastSyncAt = 0;
let syncInProgress = false;
let sensorIdCache = new Map();
let sensorIdCacheExpiresAt = 0;

const parsedSensorCacheTtl = Number.parseInt(process.env.SENSOR_CACHE_TTL_MS || '60000', 10);
const SENSOR_CACHE_TTL_MS = Number.isFinite(parsedSensorCacheTtl)
  ? Math.max(5000, parsedSensorCacheTtl)
  : 60000;

function formatCurrentTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildSensorIdMap(sensorDocs) {
  const map = new Map();

  sensorDocs.forEach((doc) => {
    const sensorKey = normalizeSensorKey(doc.name);
    if (!sensorKey) return;
    if (!DASHBOARD_SENSOR_KEYS.includes(sensorKey)) return;
    map.set(sensorKey, doc._id);
  });

  return map;
}

async function ensureSensorIdCache(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && sensorIdCache.size > 0 && now < sensorIdCacheExpiresAt) {
    return sensorIdCache;
  }

  const sensorNames = DASHBOARD_SENSOR_KEYS.map((key) => SENSOR_NAME_MAP[key]).filter(Boolean);
  const sensorDocs = await Sensor.find({ name: { $in: sensorNames }, isActive: true })
    .select('_id name')
    .lean();

  sensorIdCache = buildSensorIdMap(sensorDocs);
  sensorIdCacheExpiresAt = now + SENSOR_CACHE_TTL_MS;
  return sensorIdCache;
}

async function ensureDeviceDocument(deviceName) {
  return Device.findOneAndUpdate(
    { name: deviceName },
    {
      $setOnInsert: {
        name: deviceName,
        status: 'off',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
}

async function saveSensorMetricsToMongo(packet, timestampDate) {
  const sensorIdMap = await ensureSensorIdCache();

  const entries = [
    { sensorKey: 'temperature', value: Number(packet.temperature) },
    { sensorKey: 'humidity', value: Number(packet.humidity) },
    { sensorKey: 'light', value: Number(packet.light) },
  ];

  const docs = entries
    .map((entry) => {
      const sensorObjectId = sensorIdMap.get(entry.sensorKey);
      if (!sensorObjectId) return null;

      return {
        idSensor: sensorObjectId,
        value: entry.value,
        timestamp: timestampDate,
      };
    })
    .filter(Boolean);

  if (!docs.length) {
    console.warn('[sensor] No active sensors found to persist metrics');
    return;
  }

  await DataSensor.insertMany(docs);
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calculateLuxFromRaw(lightRaw, lightPercent) {
  if (lightRaw !== null) {
    const lux = (Math.max(0, lightRaw) / 4095) * 1000;
    return Number(lux.toFixed(2));
  }

  // Backward-compatible fallback when only percent is available.
  if (lightPercent !== null) {
    return Number((Math.max(0, Math.min(100, lightPercent)) * 10).toFixed(2));
  }

  return 0;
}

function isPacketSensorPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return (
    typeof payload.sensor_id === 'string' &&
    (payload.temperature !== undefined || payload.humidity !== undefined || payload.light_percent !== undefined || payload.light_raw !== undefined)
  );
}

async function syncDeviceStatesFromDb(reason) {
  if (!client || !connected) {
    return;
  }

  const now = Date.now();
  if (now - lastSyncAt < HW_SYNC_MIN_INTERVAL_MS) {
    return;
  }

  if (syncInProgress) {
    return;
  }

  syncInProgress = true;
  lastSyncAt = now;

  try {
    const docs = await Device.find({ name: { $in: DEVICE_IDS } }).lean();
    const statusMap = new Map(docs.map((doc) => [doc.name, doc.status]));

    let publishedCount = 0;

    DEVICE_IDS.forEach((deviceId) => {
      const status = statusMap.get(deviceId);

      // If DB has no value or non-final value, default to OFF to keep a deterministic state.
      if (status === 'loading') {
        return;
      }

      const action = status === 'on' ? 'on' : 'off';
      if (publishControl(deviceId, action)) {
        publishedCount += 1;
      }
    });

    console.log(`[sync] reason=${reason} -> published ${publishedCount} device command(s)`);
  } catch (error) {
    console.error('[sync] Failed to republish device states from DB:', error.message);
  } finally {
    syncInProgress = false;
  }
}

function markHardwareSeen(topic) {
  const now = Date.now();
  const isFirstMessage = lastHardwareSeenAt === 0;
  const wasOffline = !isFirstMessage && (now - lastHardwareSeenAt > HARDWARE_OFFLINE_GAP_MS);

  lastHardwareSeenAt = now;

  if (isFirstMessage || wasOffline) {
    const reason = isFirstMessage ? `hardware-first-message:${topic}` : `hardware-reconnected:${topic}`;
    void syncDeviceStatesFromDb(reason);
  }
}

function connect() {
  const options = {
    host: process.env.MQTT_HOST || 'localhost',
    port: parseInt(process.env.MQTT_PORT) || 1883,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `smarthome_backend_${uuidv4().substring(0, 8)}`,
    reconnectPeriod: 5000,
    connectTimeout: 30000,
  };

  console.log(`Connecting to MQTT broker at ${options.host}:${options.port}...`);
  client = mqtt.connect(options);

  client.on('connect', () => {
    connected = true;
    console.log('MQTT connected successfully');

    // Subscribe to topics
    const topics = [
      process.env.TOPIC_SENSOR_DATA || 'sensor/data',
      process.env.TOPIC_DEVICE_STATUS || 'device/status',
    ];

    client.subscribe(topics, (err) => {
      if (err) {
        console.error('MQTT subscribe error:', err);
      } else {
        console.log('Subscribed to topics:', topics);
        void syncDeviceStatesFromDb('mqtt-connect');
      }
    });
  });

  client.on('message', async (topic, message) => {
    try {
      const payload = JSON.parse(message.toString());
      await handleMessage(topic, payload);
    } catch (e) {
      console.warn('Failed to parse MQTT message:', message.toString());
    }
  });

  client.on('error', (err) => {
    console.error('MQTT error:', err.message);
    connected = false;
  });

  client.on('reconnect', () => {
    console.log('MQTT reconnecting...');
  });

  client.on('close', () => {
    connected = false;
    console.log('MQTT connection closed');
  });
}

// Handle incoming MQTT messages from hardware
async function handleMessage(topic, payload) {
  const sensorTopic = process.env.TOPIC_SENSOR_DATA || 'sensor/data';
  const statusTopic = process.env.TOPIC_DEVICE_STATUS || 'device/status';

  if (topic === sensorTopic || topic === statusTopic) {
    markHardwareSeen(topic);
  }

  if (topic === sensorTopic) {
    // New hardware payload example:
    // {
    //   "sensor_id":"ESP32_001","temperature":25.8,"humidity":73,
    //   "light_raw":1379,"light_percent":33,"light_digital":0,
    //   "is_dark":false,"timestamp":240520
    // }
    if (isPacketSensorPayload(payload)) {
      const lightPercent = toNullableNumber(payload.light_percent);
      const lightRaw = toNullableNumber(payload.light_raw);
      const lightLux = calculateLuxFromRaw(lightRaw, lightPercent);
      const timestampDate = new Date();
      const timestampText = formatCurrentTime(timestampDate);

      const packet = {
        id: `${uuidv4().substring(0, 20)}`,
        sensor_id: payload.sensor_id || 'UNKNOWN_SENSOR',
        temperature: toNullableNumber(payload.temperature) ?? 0,
        humidity: toNullableNumber(payload.humidity) ?? 0,
        // Lux for UI: light_raw / 4095 * 1000
        light: lightLux,
        light_raw: lightRaw,
        light_percent: lightPercent,
        light_digital: toNullableNumber(payload.light_digital),
        is_dark: Boolean(payload.is_dark),
        hw_timestamp: payload.timestamp ?? null,
        // Dung thoi diem backend nhan du lieu de tranh timestamp cu tu hardware.
        timestamp: timestampText,
      };

      store.addSensorPacket(packet);

      try {
        await saveSensorMetricsToMongo(packet, timestampDate);
      } catch (error) {
        console.warn('Failed to save sensor data to MongoDB:', error.message);
      }

      console.log('Sensor packet received:', packet);
      return;
    }

    // Backward-compatible payload: { sensor: "Temperature", value: 24.5, unit: "°C" }
    const legacyEntry = {
      id: `${uuidv4().substring(0, 20)}`,
      sensor_name: payload.sensor || payload.sensor_name || 'Unknown',
      value: payload.value,
      unit: payload.unit || '',
      timestamp: formatCurrentTime(),
      status: determineSensorStatus(payload.sensor || '', payload.value),
    };
    store.addSensorData(legacyEntry);
    console.log('Legacy sensor data received:', legacyEntry);
  }

  if (topic === statusTopic) {
    // Payload from HW: { deviceName, status, result, message, timestamp }
    await handleDeviceStatusPayload(payload);
  }
}

// Handle device/status message from hardware
async function handleDeviceStatusPayload(payload) {
  const deviceName = String(payload.deviceName || '').toLowerCase().trim();
  const finalStatus = String(payload.status || '').toLowerCase().trim();
  const commandSuccess = payload.success !== false; // Treat as success unless explicitly false
  const actionHistoryStatus = commandSuccess ? 'success' : 'error';

  if (!deviceName || !['on', 'off'].includes(finalStatus)) {
    console.warn('Invalid device/status payload:', payload);
    return;
  }

  let deviceDoc;
  try {
    deviceDoc = await ensureDeviceDocument(deviceName);
  } catch (e) {
    console.error('Failed to ensure Device before processing status payload:', e.message);
    return;
  }

  // Clear pending timeout
  const pending = pendingCommands.get(deviceName);
  if (pending) {
    clearTimeout(pending.timerId);
    pendingCommands.delete(deviceName);
  }

  // Update ActionHistory
  try {
    if (pending?.actionHistoryId) {
      await ActionHistory.findByIdAndUpdate(pending.actionHistoryId, { status: actionHistoryStatus });
    } else if (deviceDoc?._id) {
      // Fallback: find latest loading record for this device (e.g. after server restart)
      await ActionHistory.findOneAndUpdate(
        { idDevice: deviceDoc._id, status: 'loading' },
        { status: actionHistoryStatus },
        { sort: { time: -1 } }
      );
    }
  } catch (e) {
    console.error('Failed to update ActionHistory on device/status:', e.message);
  }

  // Update Device status
  try {
    await Device.findByIdAndUpdate(
      deviceDoc._id,
      { status: finalStatus },
      { new: false }
    );
  } catch (e) {
    console.error('Failed to update Device on device/status:', e.message);
  }

  console.log(`[device/status] ${deviceName} => ${finalStatus}`);
}

// Revert device and ActionHistory after timeout
async function revertPendingCommand(deviceName) {
  const pending = pendingCommands.get(deviceName);
  if (!pending) return;
  pendingCommands.delete(deviceName);

  console.warn(`[timeout] Device ${deviceName} did not respond in ${PENDING_TIMEOUT_MS}ms — marking as error`);

  try {
    if (pending.actionHistoryId) {
      await ActionHistory.findByIdAndUpdate(pending.actionHistoryId, { status: 'error' });
    }
  } catch (e) {
    console.error('Failed to update ActionHistory on timeout:', e.message);
  }

  try {
    await Device.findOneAndUpdate(
      { name: deviceName },
      { status: pending.previousStatus },
      { upsert: true }
    );
  } catch (e) {
    console.error('Failed to revert Device on timeout:', e.message);
  }
}

// Called by deviceRoutes after publishing control command
function registerPendingCommand(deviceName, actionHistoryId, previousStatus) {
  const existing = pendingCommands.get(deviceName);
  if (existing) clearTimeout(existing.timerId);

  const timerId = setTimeout(() => revertPendingCommand(deviceName), PENDING_TIMEOUT_MS);
  pendingCommands.set(deviceName, { timerId, actionHistoryId, previousStatus });
  console.log(`[pending] Registered ${deviceName} (previousStatus="${previousStatus}", timeout=${PENDING_TIMEOUT_MS}ms)`);
}

function determineSensorStatus(sensorType, value) {
  const type = sensorType.toLowerCase();
  if (type.includes('temp')) {
    return value > 35 ? 'High' : value < 15 ? 'Low' : 'Normal';
  }
  if (type.includes('humid')) {
    return value > 80 ? 'High' : value < 20 ? 'Low' : 'Normal';
  }
  if (type.includes('light')) {
    return value > 500 ? 'High' : 'Normal';
  }
  return 'Normal';
}

// Publish a command to hardware
// Payload format HW expects: { deviceName, action }
function publishControl(deviceName, action) {
  if (!client || !connected) {
    console.warn('MQTT not connected, cannot publish control command');
    return false;
  }
  const topic = process.env.TOPIC_DEVICE_CONTROL || 'device/control';
  const payload = JSON.stringify({ deviceName, action });
  client.publish(topic, payload, { qos: 1 });
  console.log(`Published to ${topic}:`, payload);
  return true;
}

function isConnected() {
  return connected;
}

module.exports = { connect, publishControl, isConnected, registerPendingCommand };
