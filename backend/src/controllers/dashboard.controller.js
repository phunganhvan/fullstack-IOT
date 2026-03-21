const DataSensor = require('../model/dataSensor.model');
const Device = require('../model/device.model');
const Sensor = require('../model/sensor.model');
const { DEVICE_IDS, PUBLIC_DEVICE_LIST } = require('../constants/devices');
const {
  DASHBOARD_SENSOR_KEYS,
  SENSOR_NAME_MAP,
  SENSOR_UNIT_MAP,
  normalizeSensorKey,
  getLegacySensorKeys,
} = require('../constants/sensors');

function getMetricStatus(sensorKey, value) {
  const metric = String(sensorKey || '').toLowerCase();
  const numericValue = Number(value) || 0;

  if (metric === 'temperature') {
    return numericValue > 35 ? 'High' : numericValue < 15 ? 'Low' : 'Normal';
  }
  if (metric === 'humidity') {
    return numericValue > 80 ? 'High' : numericValue < 20 ? 'Low' : 'Normal';
  }
  if (metric === 'light') {
    return numericValue > 500 ? 'High' : numericValue < 100 ? 'Low' : 'Normal';
  }

  return 'Normal';
}

function getFallbackMetaByKey(key) {
  return {
    objectId: null,
    key,
    name: SENSOR_NAME_MAP[key] || key,
    unit: SENSOR_UNIT_MAP[key] || '',
  };
}

function buildSensorLookup(sensorDocs = []) {
  const byKey = new Map();
  const byObjectId = new Map();

  sensorDocs.forEach((doc) => {
    const sensorKey = normalizeSensorKey(doc.name);
    if (!sensorKey) return;

    const meta = {
      objectId: doc._id,
      key: sensorKey,
      name: doc.name || SENSOR_NAME_MAP[sensorKey] || sensorKey,
      unit: typeof doc.unit === 'string' ? doc.unit : SENSOR_UNIT_MAP[sensorKey] || '',
    };

    if (!byKey.has(sensorKey)) {
      byKey.set(sensorKey, meta);
    }
    byObjectId.set(String(doc._id), meta);
  });

  return { byKey, byObjectId };
}

function buildSensorDocFilter(sensorObjectId, legacyKeys = []) {
  const normalizedLegacyKeys = Array.from(new Set(legacyKeys.filter(Boolean)));

  const legacyFilter = normalizedLegacyKeys.length
    ? [
        { idSensor: { $exists: false }, sensorName: { $in: normalizedLegacyKeys } },
        { idSensor: null, sensorName: { $in: normalizedLegacyKeys } },
        { idSensor: { $type: 'string' }, sensorName: { $in: normalizedLegacyKeys } },
      ]
    : [];

  if (!sensorObjectId && legacyFilter.length) {
    return { $or: legacyFilter };
  }

  if (!sensorObjectId) {
    return {};
  }

  if (!legacyFilter.length) {
    return { idSensor: sensorObjectId };
  }

  return {
    $or: [{ idSensor: sensorObjectId }, ...legacyFilter],
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatChartTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getLatestValueBySensor(latestMap, sensorKey) {
  const doc = latestMap[sensorKey];
  return doc ? Number(doc.value) || 0 : 0;
}

async function getLatestRecordsBySensor(sensorMetaByKey) {
  const entries = await Promise.all(
    DASHBOARD_SENSOR_KEYS.map(async (sensorKey) => {
      const sensorMeta = sensorMetaByKey.get(sensorKey) || getFallbackMetaByKey(sensorKey);
      const doc = await DataSensor.findOne(buildSensorDocFilter(sensorMeta.objectId, sensorMeta.legacyKeys))
        .sort({ timestamp: -1, _id: -1 })
        .lean();

      return [sensorKey, doc];
    })
  );

  return Object.fromEntries(entries);
}

async function getRecentSeries(sensorMetaByKey, limitPerSensor = 6) {
  const entries = await Promise.all(
    DASHBOARD_SENSOR_KEYS.map(async (sensorKey) => {
      const sensorMeta = sensorMetaByKey.get(sensorKey) || getFallbackMetaByKey(sensorKey);
      const docs = await DataSensor.find(buildSensorDocFilter(sensorMeta.objectId, sensorMeta.legacyKeys))
        .sort({ timestamp: -1, _id: -1 })
        .limit(limitPerSensor)
        .lean();

      return [sensorKey, docs.reverse()];
    })
  );

  return Object.fromEntries(entries);
}

function buildChartData(series) {
  const maxLength = Math.max(
    series.temperature?.length || 0,
    series.humidity?.length || 0,
    series.light?.length || 0
  );

  const chart = [];
  for (let index = 0; index < maxLength; index += 1) {
    const temperatureDoc = series.temperature?.[index] || null;
    const humidityDoc = series.humidity?.[index] || null;
    const lightDoc = series.light?.[index] || null;
    const timeSource = temperatureDoc || humidityDoc || lightDoc;

    chart.push({
      time: timeSource ? formatChartTime(timeSource.timestamp) : `T${index + 1}`,
      temperature: temperatureDoc ? Number(temperatureDoc.value) || 0 : null,
      humidity: humidityDoc ? Number(humidityDoc.value) || 0 : null,
      light: lightDoc ? Number(lightDoc.value) || 0 : null,
    });
  }

  return chart;
}

async function getDashboard(req, res) {
  try {
    const sensorDocs = await Sensor.find({ isActive: true }).lean();
    const sensorLookup = buildSensorLookup(sensorDocs);

    const sensorMetaByKey = new Map(
      DASHBOARD_SENSOR_KEYS.map((sensorKey) => {
        const baseMeta = sensorLookup.byKey.get(sensorKey) || getFallbackMetaByKey(sensorKey);
        return [
          sensorKey,
          {
            ...baseMeta,
            legacyKeys: getLegacySensorKeys(sensorKey),
          },
        ];
      })
    );

    const [latestRecordsBySensor, series] = await Promise.all([
      getLatestRecordsBySensor(sensorMetaByKey),
      getRecentSeries(sensorMetaByKey, 6),
    ]);

    const temperatureValue = getLatestValueBySensor(latestRecordsBySensor, 'temperature');
    const humidityValue = getLatestValueBySensor(latestRecordsBySensor, 'humidity');
    const lightValue = getLatestValueBySensor(latestRecordsBySensor, 'light');

    const sensors = {
      temperature: {
        value: temperatureValue,
        trend: '',
        status: getMetricStatus('temperature', temperatureValue),
      },
      humidity: {
        value: humidityValue,
        trend: '',
        status: getMetricStatus('humidity', humidityValue),
      },
      lightIntensity: {
        value: lightValue,
        trend: '',
        status: getMetricStatus('light', lightValue),
      },
    };

    const chart = buildChartData(series);
    const deviceDocs = await Device.find({ name: { $in: DEVICE_IDS } }).lean();
    const devices = {};
    DEVICE_IDS.forEach((id) => {
      const doc = deviceDocs.find((d) => d.name === id);
      devices[id] = { status: doc ? doc.status : 'off' };
    });

    const latestRecords = DASHBOARD_SENSOR_KEYS
      .map((sensorKey) => {
        const item = latestRecordsBySensor[sensorKey];
        if (!item) return null;

        const sensorMeta = sensorMetaByKey.get(sensorKey) || getFallbackMetaByKey(sensorKey);

        return {
          id: item._id,
          sensorId: sensorMeta.objectId,
          sensorKey,
          sensorName: sensorMeta.name,
          unit: sensorMeta.unit,
          value: item.value,
          timestamp: formatDateTime(item.timestamp),
        };
      })
      .filter(Boolean);

    return res.json({
      sensors,
      devices,
      deviceList: PUBLIC_DEVICE_LIST,
      chartData: chart,
      latestRecords,
    });
  } catch (error) {
    console.error('Failed to build dashboard from MongoDB:', error.message);
    return res.status(500).json({ message: 'Failed to load dashboard data from MongoDB' });
  }
}

module.exports = {
  getDashboard,
};
