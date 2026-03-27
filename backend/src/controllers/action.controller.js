const ActionHistory = require('../model/actionHistory.model');
const Device = require('../model/device.model');
const { DEVICE_LABEL_MAP, PUBLIC_DEVICE_LIST, normalizeDeviceId } = require('../constants/devices');

function pad(value) {
    return String(value).padStart(2, '0');
}

function formatDate(dateValue) {
    const value = new Date(dateValue);
    if (Number.isNaN(value.getTime())) return String(dateValue || '');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function normalizeDataType(dataType) {
    const normalized = String(dataType || '').trim().toLowerCase();
    if (normalized === 'action time' || normalized === 'action_time') return 'action_time';
    return 'action';
}

function parseActionTimeRange(searchValue) {
    const trimmed = String(searchValue || '').trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2})(?::(\d{2})(?::(\d{2}))?)?)?$/);

    if (!match) {
        return {
            ok: false,
            message: 'Action Time must follow YYYY-MM-DD with optional HH, HH:mm or HH:mm:ss',
        };
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
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
        return { ok: false, message: 'Invalid hour/minute/second in Action Time' };
    }

    const start = new Date(year, month - 1, day, hour, minute, second, 0);
    if (
        start.getFullYear() !== year ||
        start.getMonth() !== month - 1 ||
        start.getDate() !== day
    ) {
        return { ok: false, message: 'Invalid day/month/year in Action Time' };
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

function formatStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'loading') return 'LOADING';
    if (normalized === 'success') return 'SUCCESS';
    if (normalized === 'error') return 'ERROR';
    return 'ERROR';
}

function resolveRequestedDeviceId(value) {
    const normalized = normalizeDeviceId(value);
    if (normalized) return normalized;

    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'all') return '';
    return raw;
}

function buildActionDeviceList(deviceDocs = []) {
    const byName = new Map(deviceDocs.map((doc) => [doc.name, doc]));
    const list = [];

    PUBLIC_DEVICE_LIST.forEach((base) => {
        const doc = byName.get(base.id);
        list.push({
            id: base.id,
            label: doc?.label || base.label,
            actionIcon: doc?.actionIcon || base.actionIcon,
        });
    });

    deviceDocs.forEach((doc) => {
        if (PUBLIC_DEVICE_LIST.some((base) => base.id === doc.name)) {
            return;
        }

        list.push({
            id: doc.name,
            label: doc.label || String(doc.name || '').toUpperCase(),
            actionIcon: doc.actionIcon || '🔧',
        });
    });

    return list;
}

function getDeviceLabel(deviceName, labelMap) {
    const normalizedName = normalizeDeviceId(deviceName);
    const key = normalizedName || String(deviceName || '').toLowerCase();
    return labelMap[key] || DEVICE_LABEL_MAP[key] || deviceName || 'Unknown Device';
}

async function getActions(req, res) {
    let { page = 1, limit = 10, search = '', dataType = 'action', device = '', order = 'desc' } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    try {
        const normalizedDataType = normalizeDataType(dataType);
        const normalizedDevice = resolveRequestedDeviceId(device);
        const trimmedSearch = String(search || '').trim();
        const mongoFilter = {};
        const andConditions = [];
        const deviceDocs = await Device.find({ isDeleted: { $ne: true } }).select('_id name label actionIcon').lean();
        const deviceList = buildActionDeviceList(deviceDocs);
        const deviceIdByName = new Map(deviceDocs.map((doc) => [doc.name, doc._id]));
        const labelMap = {
            ...DEVICE_LABEL_MAP,
            ...Object.fromEntries(deviceDocs.map((doc) => [doc.name, doc.label || String(doc.name || '').toUpperCase()])),
        };

        if (normalizedDevice) {
            const selectedDeviceId = deviceIdByName.get(normalizedDevice);

            if (!selectedDeviceId) {
                return res.json({ total: 0, page, limit, data: [], deviceList });
            }

            andConditions.push({ idDevice: selectedDeviceId });
        }

        if (trimmedSearch) {
            if (normalizedDataType === 'action') {
                const normalizedAction = trimmedSearch.toLowerCase();
                if (!['on', 'off'].includes(normalizedAction)) {
                    return res.status(400).json({ message: 'Action must be "on" or "off"' });
                }
                andConditions.push({ action: normalizedAction });
            }

            if (normalizedDataType === 'action_time') {
                const parsedRange = parseActionTimeRange(trimmedSearch);
                if (!parsedRange.ok) {
                    return res.status(400).json({ message: parsedRange.message });
                }

                andConditions.push({
                    time: {
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

        const sortOrder = order === 'asc' ? 1 : -1;
        const total = await ActionHistory.countDocuments(mongoFilter);
        const docs = await ActionHistory.find(mongoFilter)
            .sort({ time: sortOrder, _id: sortOrder })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate('idDevice', 'name')
            .lean();

        const items = docs.map((doc) => {
            const rawDeviceName =
                doc.idDevice && typeof doc.idDevice === 'object' && doc.idDevice.name
                    ? doc.idDevice.name
                    : String(doc.idDevice || '');

            const normalizedDeviceName = normalizeDeviceId(rawDeviceName);
            const deviceName = normalizedDeviceName || rawDeviceName;

            return {
                id: doc._id,
                sensor_name: getDeviceLabel(deviceName, labelMap),
                value: String(doc.action || '').toUpperCase(),
                timestamp: formatDate(doc.time),
                status: formatStatus(doc.status),
                idDevice: deviceName,
                action: doc.action,
                rawStatus: doc.status,
            };
        });

        return res.json({ total, page, limit, data: items, deviceList });
    } catch (error) {
        console.error('Failed to query ActionHistory collection:', error.message);
        return res.status(500).json({ message: 'Failed to load action history from MongoDB' });
    }
}

module.exports = {
    getActions,
};
