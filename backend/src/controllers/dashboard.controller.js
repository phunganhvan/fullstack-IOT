const DataSensor = require('../model/dataSensor.model');
const Device = require('../model/device.model');
const Sensor = require('../model/sensor.model');
const { PUBLIC_DEVICE_LIST } = require('../constants/devices');
const {
    DASHBOARD_SENSOR_KEYS,
    SENSOR_NAME_MAP,
    SENSOR_UNIT_MAP,
    normalizeSensorKey,
    getLegacySensorKeys,
} = require('../constants/sensors');

const SIMULATED_SENSOR_COLORS = ['#8b5cf6', '#10b981', '#f97316', '#06b6d4', '#ec4899', '#84cc16', '#14b8a6'];
const SENSOR_ICON_MAP = {
    temperature: '🌡',
    humidity: '💧',
    light: '☀️',
};

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toDynamicSensorKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^[_-]+|[_-]+$/g, '');
}

function hashString(value) {
    return String(value || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
}

function pickColorByKey(key) {
    const idx = hashString(key) % SIMULATED_SENSOR_COLORS.length;
    return SIMULATED_SENSOR_COLORS[idx];
}

function generateRandomValue(min, max) {
    const lower = safeNumber(min, 0);
    const upper = safeNumber(max, 100);
    if (upper <= lower) return Number(lower.toFixed(2));
    return Number((Math.random() * (upper - lower) + lower).toFixed(2));
}

function getCoreSensorConfig(key) {
    if (key === 'temperature') {
        return {
            name: SENSOR_NAME_MAP.temperature || 'Temperature',
            unit: SENSOR_UNIT_MAP.temperature || '°C',
            color: '#ef4444',
            axis: 'left',
            icon: SENSOR_ICON_MAP.temperature,
        };
    }

    if (key === 'humidity') {
        return {
            name: SENSOR_NAME_MAP.humidity || 'Humidity',
            unit: SENSOR_UNIT_MAP.humidity || '%',
            color: '#3b82f6',
            axis: 'left',
            icon: SENSOR_ICON_MAP.humidity,
        };
    }

    if (key === 'light') {
        return {
            name: SENSOR_NAME_MAP.light || 'Light Sensor',
            unit: SENSOR_UNIT_MAP.light || 'Lux',
            color: '#f59e0b',
            axis: 'right',
            icon: SENSOR_ICON_MAP.light,
        };
    }

    return {
        name: key,
        unit: '',
        color: pickColorByKey(key),
        axis: 'right',
        icon: '📈',
    };
}

function getMetricStatus(sensorKey, value, sensorMeta = null) {
    const metric = String(sensorKey || '').toLowerCase();
    const numericValue = safeNumber(value);

    if (metric === 'temperature') {
        return numericValue > 35 ? 'High' : numericValue < 15 ? 'Low' : 'Normal';
    }
    if (metric === 'humidity') {
        return numericValue > 80 ? 'High' : numericValue < 20 ? 'Low' : 'Normal';
    }
    if (metric === 'light') {
        return numericValue > 500 ? 'High' : numericValue < 100 ? 'Low' : 'Normal';
    }

    if (sensorMeta) {
        const min = safeNumber(sensorMeta.randomMin, 0);
        const max = safeNumber(sensorMeta.randomMax, 100);
        if (max > min) {
            const lowThreshold = min + (max - min) * 0.25;
            const highThreshold = min + (max - min) * 0.75;
            return numericValue > highThreshold ? 'High' : numericValue < lowThreshold ? 'Low' : 'Normal';
        }
    }

    return 'Normal';
}

function getFallbackMetaByKey(key) {
    const core = getCoreSensorConfig(key);
    return {
        objectId: null,
        key,
        name: core.name,
        unit: core.unit,
        chartColor: core.color,
        axis: core.axis,
        icon: core.icon,
        isSimulated: false,
        randomMin: 0,
        randomMax: 100,
        legacyKeys: getLegacySensorKeys(key),
    };
}

function buildSensorMetaList(sensorDocs = []) {
    const result = [];

    sensorDocs.forEach((doc, index) => {
        const knownKey = normalizeSensorKey(doc.name);
        const dynamicKey = toDynamicSensorKey(doc.name);
        const key = knownKey || dynamicKey || `sensor_${index + 1}`;
        const core = getCoreSensorConfig(key);

        result.push({
            objectId: doc._id,
            key,
            name: doc.name || core.name,
            unit: typeof doc.unit === 'string' && doc.unit.trim() ? doc.unit.trim() : core.unit,
            chartColor: String(doc.chartColor || '').trim() || core.color,
            axis: core.axis,
            icon: core.icon,
            isSimulated: Boolean(doc.isSimulated),
            randomMin: safeNumber(doc.randomMin, 0),
            randomMax: safeNumber(doc.randomMax, 100),
            legacyKeys: knownKey ? getLegacySensorKeys(knownKey) : [],
        });
    });

    if (!result.length) {
        DASHBOARD_SENSOR_KEYS.forEach((sensorKey) => {
            result.push(getFallbackMetaByKey(sensorKey));
        });
    }

    return result;
}

async function appendSimulatedSensorReadings(sensorMetaList = []) {
    const docs = sensorMetaList
        .filter((meta) => meta.isSimulated && meta.objectId)
        .map((meta) => ({
            idSensor: meta.objectId,
            value: generateRandomValue(meta.randomMin, meta.randomMax),
            timestamp: new Date(),
        }));

    if (!docs.length) return;

    try {
        await DataSensor.insertMany(docs, { ordered: false });
    } catch (error) {
        console.warn('Failed to append simulated sensor reading(s):', error.message);
    }
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
        Array.from(sensorMetaByKey.keys()).map(async (sensorKey) => {
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
        Array.from(sensorMetaByKey.keys()).map(async (sensorKey) => {
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

function buildTrend(series = []) {
    if (!Array.isArray(series) || series.length < 2) return '';

    const prev = safeNumber(series[series.length - 2]?.value, NaN);
    const next = safeNumber(series[series.length - 1]?.value, NaN);
    if (!Number.isFinite(prev) || !Number.isFinite(next)) return '';
    if (next > prev) return '↗';
    if (next < prev) return '↘';
    return '→';
}

function buildChartData(seriesMap, sensorMetaList) {
    const maxLength = Math.max(
        ...sensorMetaList.map((meta) => (seriesMap[meta.key] || []).length),
        0
    );

    const chart = [];
    for (let index = 0; index < maxLength; index += 1) {
        const point = {};

        let timeSource = null;
        sensorMetaList.forEach((meta) => {
            const doc = seriesMap[meta.key]?.[index] || null;
            if (!timeSource && doc) {
                timeSource = doc;
            }
            point[meta.key] = doc ? safeNumber(doc.value, 0) : null;
        });

        point.time = timeSource ? formatChartTime(timeSource.timestamp) : `T${index + 1}`;
        chart.push(point);
    }

    return chart;
}

function buildDeviceList(deviceDocs = []) {
    const byName = new Map(deviceDocs.map((doc) => [doc.name, doc]));
    const list = [];

    PUBLIC_DEVICE_LIST.forEach((base) => {
        const doc = byName.get(base.id);
        list.push({
            id: base.id,
            label: doc?.label || base.label,
            dashboardType: doc?.dashboardType || base.dashboardType,
            dashboardIcon: doc?.dashboardIcon || base.dashboardIcon,
            actionIcon: doc?.actionIcon || base.actionIcon,
            isSimulated: Boolean(doc?.isSimulated),
        });
    });

    deviceDocs.forEach((doc) => {
        if (PUBLIC_DEVICE_LIST.some((base) => base.id === doc.name)) {
            return;
        }

        list.push({
            id: doc.name,
            label: doc.label || String(doc.name || '').toUpperCase(),
            dashboardType: doc.dashboardType || 'bulb',
            dashboardIcon: doc.dashboardIcon || doc.dashboardType || 'bulb',
            actionIcon: doc.actionIcon || '🔧',
            isSimulated: Boolean(doc.isSimulated),
        });
    });

    return list;
}

async function getDashboard(req, res) {
    try {
        const sensorDocs = await Sensor.find({ isActive: true }).lean();
        const sensorMetaList = buildSensorMetaList(sensorDocs);

        await appendSimulatedSensorReadings(sensorMetaList);

        const sensorMetaByKey = new Map(sensorMetaList.map((meta) => [meta.key, meta]));

        const [latestRecordsBySensor, series] = await Promise.all([
            getLatestRecordsBySensor(sensorMetaByKey),
            getRecentSeries(sensorMetaByKey, 6),
        ]);

        const sensorCards = sensorMetaList.map((meta) => {
            const latest = latestRecordsBySensor[meta.key];
            const value = latest ? safeNumber(latest.value, 0) : 0;
            const trend = buildTrend(series[meta.key] || []);

            return {
                key: meta.key,
                label: meta.name,
                unit: meta.unit,
                value,
                trend,
                status: getMetricStatus(meta.key, value, meta),
                chartColor: meta.chartColor,
                icon: meta.icon,
                isSimulated: meta.isSimulated,
            };
        });

        const chart = buildChartData(series, sensorMetaList);
        const chartSeries = sensorMetaList.map((meta) => ({
            key: meta.key,
            name: meta.name,
            color: meta.chartColor,
            yAxisId: meta.axis,
            strokeDasharray: meta.key === 'light' ? '6 3' : undefined,
        }));

        const deviceDocs = await Device.find({ isDeleted: { $ne: true } }).lean();
        const deviceList = buildDeviceList(deviceDocs);
        const byDeviceName = new Map(deviceDocs.map((doc) => [doc.name, doc]));
        const devices = {};
        deviceList.forEach((item) => {
            const doc = byDeviceName.get(item.id);
            devices[item.id] = { status: doc ? doc.status : 'off' };
        });

        const temperatureValue = getLatestValueBySensor(latestRecordsBySensor, 'temperature');
        const humidityValue = getLatestValueBySensor(latestRecordsBySensor, 'humidity');
        const lightValue = getLatestValueBySensor(latestRecordsBySensor, 'light');

        const sensors = {
            temperature: {
                value: temperatureValue,
                trend: buildTrend(series.temperature || []),
                status: getMetricStatus('temperature', temperatureValue),
            },
            humidity: {
                value: humidityValue,
                trend: buildTrend(series.humidity || []),
                status: getMetricStatus('humidity', humidityValue),
            },
            lightIntensity: {
                value: lightValue,
                trend: buildTrend(series.light || []),
                status: getMetricStatus('light', lightValue),
            },
        };

        const latestRecords = sensorMetaList
            .map((meta) => {
                const item = latestRecordsBySensor[meta.key];
                if (!item) return null;

                return {
                    id: item._id,
                    sensorId: meta.objectId,
                    sensorKey: meta.key,
                    sensorName: meta.name,
                    unit: meta.unit,
                    value: item.value,
                    timestamp: formatDateTime(item.timestamp),
                };
            })
            .filter(Boolean);

        return res.json({
            sensors,
            sensorCards,
            devices,
            deviceList,
            chartData: chart,
            chartSeries,
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
