const store = require('../services/dataStore');
const DataSensor = require('../model/dataSensor.model');
const Sensor = require('../model/sensor.model');
const {
    SENSOR_LIST,
    SENSOR_NAME_MAP,
    SENSOR_UNIT_MAP,
    normalizeSensorKey,
    getLegacySensorKeys,
} = require('../constants/sensors');

const SIMULATED_SENSOR_COLORS = [
    '#8b5cf6',
    '#10b981',
    '#f97316',
    '#06b6d4',
    '#ec4899',
    '#22c55e',
    '#f43f5e',
    '#84cc16',
];

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

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidHexColor(value) {
    return /^#(?:[0-9a-fA-F]{6})$/.test(String(value || '').trim());
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

function sortWithOrder(data, sortField, order, selectorMap) {
    const getValue = selectorMap[sortField] || selectorMap.timestamp;
    return data.sort((a, b) => {
        const va = getValue(a);
        const vb = getValue(b);
        return order === 'asc' ? va - vb : vb - va;
    });
}

function formatDate(date) {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) {
        return date;
    }

    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function getFallbackMetaByKey(key) {
    if (!key) {
        return {
            objectId: null,
            key: '',
            name: 'Unknown',
            unit: '',
        };
    }

    return {
        objectId: null,
        key,
        name: SENSOR_NAME_MAP[key] || key,
        unit: SENSOR_UNIT_MAP[key] || '',
    };
}

function buildSensorLookup(sensorDocs = []) {
    const byObjectId = new Map();
    const byKey = new Map();

    sensorDocs.forEach((doc) => {
        const key = normalizeSensorKey(doc.name) || toDynamicSensorKey(doc.name);
        if (!key) return;

        const meta = {
            objectId: doc._id,
            key,
            name: doc.name || SENSOR_NAME_MAP[key] || key,
            unit: typeof doc.unit === 'string' ? doc.unit : SENSOR_UNIT_MAP[key] || '',
            isSimulated: Boolean(doc.isSimulated),
            randomMin: safeNumber(doc.randomMin, 0),
            randomMax: safeNumber(doc.randomMax, 100),
            chartColor: String(doc.chartColor || '').trim(),
        };

        byObjectId.set(String(doc._id), meta);
        if (!byKey.has(key)) {
            byKey.set(key, meta);
        }
    });

    return { byObjectId, byKey };
}

function resolveSensorMetaFromDoc(doc, sensorLookup) {
    if (doc?.idSensor) {
        const byObjectId = sensorLookup.byObjectId.get(String(doc.idSensor));
        if (byObjectId) {
            return byObjectId;
        }
    }

    const legacyKey = normalizeSensorKey(doc?.sensorName);
    if (legacyKey) {
        return sensorLookup.byKey.get(legacyKey) || getFallbackMetaByKey(legacyKey);
    }

    return {
        objectId: doc?.idSensor || null,
        key: '',
        name: String(doc?.sensorName || 'Unknown'),
        unit: '',
    };
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

function getMetricStatus(sensorKey, value) {
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

    return 'Normal';
}

function normalizeSensorFilter(type, sensorLookup) {
    const normalizedKey = normalizeSensorKey(type) || toDynamicSensorKey(type);
    if (!normalizedKey) return null;

    const meta = sensorLookup.byKey.get(normalizedKey) || getFallbackMetaByKey(normalizedKey);
    return {
        ...meta,
        legacyKeys: getLegacySensorKeys(normalizedKey),
    };
}

function normalizeDataType(dataType) {
    const normalized = String(dataType || '').trim().toLowerCase();
    if (normalized === 'time response' || normalized === 'time_response') return 'time_response';
    return 'sensor_value';
}

// async function addSensor(req, res) {
//     const name = String(req.body.name || req.body.sensorName || '').trim();
//     const unit = String(req.body.unit || '').trim() || 'unit';
//     const randomMin = safeNumber(req.body.randomMin, 0);
//     const randomMax = safeNumber(req.body.randomMax, 100);
//     const requestedColor = String(req.body.chartColor || '').trim();

//     if (!name) {
//         return res.status(400).json({ message: 'Sensor name is required' });
//     }

//     if (randomMax <= randomMin) {
//         return res.status(400).json({ message: 'randomMax must be greater than randomMin' });
//     }

//     if (requestedColor && !isValidHexColor(requestedColor)) {
//         return res.status(400).json({ message: 'chartColor must be a valid hex color like #22c55e' });
//     }

//     try {
//         const existed = await Sensor.findOne({
//             name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
//         })
//             .select('_id')
//             .lean();

//         if (existed?._id) {
//             return res.status(409).json({ message: `Sensor ${name} already exists` });
//         }

//         const sensorKey = toDynamicSensorKey(name) || normalizeSensorKey(name);
//         const chartColor = requestedColor || pickColorByKey(sensorKey || name);

//         const created = await Sensor.create({
//             name,
//             unit,
//             isActive: true,
//             isSimulated: true,
//             randomMin,
//             randomMax,
//             chartColor,
//         });

//         const initialValue = generateRandomValue(randomMin, randomMax);
//         await DataSensor.create({
//             idSensor: created._id,
//             value: initialValue,
//             timestamp: new Date(),
//         });

//         return res.status(201).json({
//             message: 'Sensor created successfully',
//             sensor: {
//                 id: created._id,
//                 key: sensorKey || toDynamicSensorKey(created.name),
//                 name: created.name,
//                 unit: created.unit,
//                 isSimulated: true,
//                 randomMin: created.randomMin,
//                 randomMax: created.randomMax,
//                 chartColor,
//             },
//         });
//     } catch (error) {
//         console.error('Failed to add simulated sensor:', error.message);
//         return res.status(500).json({ message: 'Failed to add simulated sensor' });
//     }
// }

// async function deleteSensor(req, res) {
//     const requestedKey = String(req.params.sensorKey || '').trim();
//     const targetKey = normalizeSensorKey(requestedKey) || toDynamicSensorKey(requestedKey);

//     if (!targetKey) {
//         return res.status(400).json({ message: 'sensorKey is required' });
//     }

//     try {
//         const sensorDocs = await Sensor.find({ isActive: true }).select('_id name isSimulated').lean();
//         const target = sensorDocs.find((doc) => {
//             const key = normalizeSensorKey(doc.name) || toDynamicSensorKey(doc.name);
//             return key === targetKey;
//         });

//         if (!target?._id) {
//             return res.status(404).json({ message: `Sensor ${targetKey} not found` });
//         }

//         if (!target.isSimulated) {
//             return res.status(403).json({ message: 'Only simulated sensors can be deleted' });
//         }

//         await DataSensor.deleteMany({ idSensor: target._id });
//         await Sensor.findByIdAndDelete(target._id);

//         return res.json({
//             message: 'Sensor deleted successfully',
//             sensorKey: targetKey,
//         });
//     } catch (error) {
//         console.error('Failed to delete simulated sensor:', error.message);
//         return res.status(500).json({ message: 'Failed to delete simulated sensor' });
//     }
// }

function parseTimeResponseRange(searchValue) {
    const trimmed = String(searchValue || '').trim();
    const match = trimmed.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})(?:\s+(\d{2})(?::(\d{2})(?::(\d{2}))?)?)?$/);

    if (!match) {
        return {
            ok: false,
            message: 'Time Response must follow DD/MM/YYYY with optional HH, HH:mm or HH:mm:ss',
        };
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const hasHour = match[4] !== undefined;
    const hasMinute = match[5] !== undefined;
    const hasSecond = match[6] !== undefined;
    const hour = hasHour ? Number(match[4]) : 0;
    const minute = hasMinute ? Number(match[5]) : 0;
    const second = hasSecond ? Number(match[6]) : 0;

    if (month < 1 || month > 12) {
        return { ok: false, message: 'Month must be between 01 and 12' };
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
        return { ok: false, message: 'Invalid hour/minute/second in Time Response' };
    }

    const start = new Date(year, month - 1, day, hour, minute, second, 0);
    if (
        start.getFullYear() !== year ||
        start.getMonth() !== month - 1 ||
        start.getDate() !== day
    ) {
        return { ok: false, message: 'Invalid day/month/year in Time Response' };
    }

    let end;
    if (hasSecond) {
        end = new Date(year, month - 1, day, hour, minute, second + 1, 0);
    } else if (hasMinute) {
        end = new Date(year, month - 1, day, hour, minute + 1, 0, 0);
    } else if (hasHour) {
        end = new Date(year, month - 1, day, hour + 1, 0, 0, 0);
    } else {
        end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
    }

    return { ok: true, start, end };
}

function getSensorPackets(req, res) {
    let { page = 1, limit = 10, search = '', sensor_id = '', sort = 'timestamp', order = 'desc' } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    let data = store.getSensorPackets();

    if (search) {
        const q = search.toLowerCase();
        data = data.filter((d) => (d.sensor_id || '').toLowerCase().includes(q));
    }

    if (sensor_id) {
        data = data.filter((d) => (d.sensor_id || '').toLowerCase() === String(sensor_id).toLowerCase());
    }

    sortWithOrder(data, sort, order, {
        timestamp: (d) => new Date(d.timestamp).getTime(),
        temperature: (d) => safeNumber(d.temperature),
        humidity: (d) => safeNumber(d.humidity),
        light: (d) => safeNumber(d.light),
    });

    const total = data.length;
    const start = (page - 1) * limit;
    const items = data.slice(start, start + limit).map((d) => ({
        id: d.id,
        sensor_id: d.sensor_id,
        temperature: d.temperature,
        humidity: d.humidity,
        light: d.light,
        timestamp: d.timestamp,
        light_raw: d.light_raw,
        light_percent: d.light_percent,
        light_digital: d.light_digital,
        is_dark: d.is_dark,
        hw_timestamp: d.hw_timestamp,
    }));

    return res.json({ total, page, limit, data: items });
}

function getLatestSensorPacket(req, res) {
    const packet = store.getLatestSensorPacket();

    if (!packet) {
        return res.status(404).json({ message: 'No sensor packet available' });
    }

    return res.json({
        id: packet.id,
        sensor_id: packet.sensor_id,
        temperature: packet.temperature,
        humidity: packet.humidity,
        light: packet.light,
        timestamp: packet.timestamp,
        light_raw: packet.light_raw,
        light_percent: packet.light_percent,
        light_digital: packet.light_digital,
        is_dark: packet.is_dark,
        hw_timestamp: packet.hw_timestamp,
    });
}

async function getSensors(req, res) {
    let { page = 1, limit = 10, search = '', dataType = 'sensor_value', type = '', sort = 'timestamp', order = 'desc' } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    try {
        const sensorDocs = await Sensor.find({ isActive: true }).lean();
        const sensorLookup = buildSensorLookup(sensorDocs);

        const normalizedType = normalizeSensorFilter(type, sensorLookup);
        const normalizedDataType = normalizeDataType(dataType);
        const searchValue = String(search || '').trim();
        const mongoFilter = {};
        const andConditions = [];

        if (normalizedType) {
            andConditions.push(buildSensorDocFilter(normalizedType.objectId, normalizedType.legacyKeys));
        }

        if (searchValue) {
            if (normalizedDataType === 'sensor_value') {
                const exactValue = Number(searchValue);
                if (!Number.isFinite(exactValue)) {
                    return res.status(400).json({ message: 'Sensor Value must be a number' });
                }
                andConditions.push({ value: exactValue });
            }

            if (normalizedDataType === 'time_response') {
                const parsedRange = parseTimeResponseRange(searchValue);
                if (!parsedRange.ok) {
                    return res.status(400).json({ message: parsedRange.message });
                }
                andConditions.push({
                    timestamp: {
                        $gte: parsedRange.start,
                        $lt: parsedRange.end,
                    },
                });
            }
        }

        if (andConditions.length === 1) {
            Object.assign(mongoFilter, andConditions[0]);
        }

        if (andConditions.length > 1) {
            mongoFilter.$and = andConditions;
        }

        const sortMap = {
            timestamp: { timestamp: order === 'asc' ? 1 : -1, _id: order === 'asc' ? 1 : -1 },
            value: { value: order === 'asc' ? 1 : -1, timestamp: -1 },
        };

        const total = await DataSensor.countDocuments(mongoFilter);
        const docs = await DataSensor.find(mongoFilter)
            .sort(sortMap[sort] || sortMap.timestamp)
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        const items = docs.map((doc) => {
            const sensorMeta = resolveSensorMetaFromDoc(doc, sensorLookup);
            return {
                id: doc._id,
                sensor_id: sensorMeta.key,
                sensor_name: sensorMeta.name,
                value: doc.value,
                unit: sensorMeta.unit,
                timestamp: formatDate(doc.timestamp),
                status: getMetricStatus(sensorMeta.key, doc.value),
            };
        });

        const sensorList = sensorDocs
            .map((doc) => {
                const meta = sensorLookup.byObjectId.get(String(doc._id));
                if (!meta) return null;
                return {
                    id: meta.objectId,
                    key: meta.key,
                    label: meta.name,
                    unit: meta.unit,
                    isSimulated: meta.isSimulated,
                    chartColor: meta.chartColor || pickColorByKey(meta.key),
                };
            })
            .filter(Boolean);

        if (!sensorList.length) {
            SENSOR_LIST.forEach((definition) => {
                sensorList.push({
                    id: null,
                    key: definition.key,
                    label: definition.name,
                    unit: definition.unit,
                    isSimulated: false,
                    chartColor: pickColorByKey(definition.key),
                });
            });
        }

        return res.json({ total, page, limit, data: items, sensorList });
    } catch (error) {
        console.error('Failed to query DataSensor collection:', error.message);
        return res.status(500).json({ message: 'Failed to load sensor data from MongoDB' });
    }
}

module.exports = {
    // addSensor,
    // deleteSensor,
    getSensorPackets,
    getLatestSensorPacket,
    getSensors,
};
