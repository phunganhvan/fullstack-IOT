const mqttService = require('../services/mqttService');
const ActionHistory = require('../model/actionHistory.model');
const Device = require('../model/device.model');
const { DEVICE_IDS, PUBLIC_DEVICE_LIST, normalizeDeviceId } = require('../constants/devices');

const VALID_ACTIONS = ['on', 'off'];
const VALID_DEVICE_TYPES = ['bulb', 'fan', 'ac'];
const ACTION_ICON_BY_TYPE = {
    bulb: '💡',
    fan: '🌀',
    ac: '❄️',
};

function toSlug(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');
}

function getDefaultDeviceMeta(deviceId) {
    const base = PUBLIC_DEVICE_LIST.find((item) => item.id === deviceId);
    if (base) {
        return {
            label: base.label,
            dashboardType: base.dashboardType,
            dashboardIcon: base.dashboardIcon,
            actionIcon: base.actionIcon,
        };
    }

    return {
        label: String(deviceId || '').toUpperCase() || 'Custom Device',
        dashboardType: 'bulb',
        dashboardIcon: 'bulb',
        actionIcon: '🔧',
    };
}

function buildDeviceList(deviceDocs = []) {
    const byName = new Map(deviceDocs.map((doc) => [doc.name, doc]));
    const result = [];

    PUBLIC_DEVICE_LIST.forEach((base) => {
        const doc = byName.get(base.id);
        result.push({
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

        result.push({
            id: doc.name,
            label: doc.label || String(doc.name || '').toUpperCase(),
            dashboardType: doc.dashboardType || 'bulb',
            dashboardIcon: doc.dashboardIcon || doc.dashboardType || 'bulb',
            actionIcon: doc.actionIcon || ACTION_ICON_BY_TYPE[doc.dashboardType] || '🔧',
            isSimulated: Boolean(doc.isSimulated),
        });
    });

    return result;
}

async function getDevices(req, res) {
    try {
        const docs = await Device.find({ isDeleted: { $ne: true } }).lean();
        const deviceList = buildDeviceList(docs);
        const byName = new Map(docs.map((doc) => [doc.name, doc]));

        const result = {};
        deviceList.forEach((item) => {
            result[item.id] = { status: byName.get(item.id)?.status || 'off' };
        });

        return res.json({ data: result, deviceList });
    } catch (error) {
        console.error('Failed to get device states:', error.message);
        return res.status(500).json({ message: 'Failed to get device states' });
    }
}

// async function addDevice(req, res) {
//     const rawName = String(req.body.name || req.body.deviceName || '').trim();
//     const label = String(req.body.label || rawName).trim();
//     const dashboardType = String(req.body.dashboardType || req.body.type || 'bulb').toLowerCase().trim();
//     const deviceId = toSlug(rawName);

//     if (!rawName || !deviceId) {
//         return res.status(400).json({ message: 'Device name is required' });
//     }

//     if (!VALID_DEVICE_TYPES.includes(dashboardType)) {
//         return res.status(400).json({ message: `dashboardType must be one of: ${VALID_DEVICE_TYPES.join(', ')}` });
//     }

//     try {
//         const existing = await Device.findOne({ name: deviceId }).select('_id isDeleted').lean();

//         if (existing?._id && !existing.isDeleted) {
//             return res.status(409).json({ message: `Device ${deviceId} already exists` });
//         }

//         if (existing?._id && existing.isDeleted) {
//             const restored = await Device.findByIdAndUpdate(
//                 existing._id,
//                 {
//                     $set: {
//                         label,
//                         dashboardType,
//                         dashboardIcon: dashboardType,
//                         actionIcon: ACTION_ICON_BY_TYPE[dashboardType] || '🔧',
//                         isSimulated: true,
//                         isDeleted: false,
//                         deletedAt: null,
//                         status: 'off',
//                     },
//                 },
//                 { new: true }
//             ).lean();

//             return res.status(201).json({
//                 message: 'Device restored successfully',
//                 device: {
//                     id: restored.name,
//                     label: restored.label,
//                     dashboardType: restored.dashboardType,
//                     dashboardIcon: restored.dashboardIcon,
//                     actionIcon: restored.actionIcon,
//                     isSimulated: true,
//                     status: restored.status,
//                 },
//             });
//         }

//         const created = await Device.create({
//             name: deviceId,
//             label,
//             dashboardType,
//             dashboardIcon: dashboardType,
//             actionIcon: ACTION_ICON_BY_TYPE[dashboardType] || '🔧',
//             isSimulated: true,
//             status: 'off',
//         });

//         return res.status(201).json({
//             message: 'Device created successfully',
//             device: {
//                 id: created.name,
//                 label: created.label,
//                 dashboardType: created.dashboardType,
//                 dashboardIcon: created.dashboardIcon,
//                 actionIcon: created.actionIcon,
//                 isSimulated: true,
//                 status: created.status,
//             },
//         });
//     } catch (error) {
//         console.error('Failed to add simulated device:', error.message);
//         return res.status(500).json({ message: 'Failed to add simulated device' });
//     }
// }

// async function deleteDevice(req, res) {
//     const requestedDevice = String(req.params.deviceId || '').trim().toLowerCase();
//     const normalizedStaticDevice = normalizeDeviceId(requestedDevice);
//     const normalizedCustomDevice = toSlug(requestedDevice);
//     const deviceId = normalizedStaticDevice || normalizedCustomDevice;

//     if (!deviceId) {
//         return res.status(400).json({ message: 'deviceId is required' });
//     }

//     try {
//         const existingDevice = await Device.findOne({ name: deviceId, isDeleted: { $ne: true } }).lean();

//         if (!existingDevice?._id) {
//             return res.status(404).json({ message: `Device ${deviceId} not found` });
//         }

//         if (!existingDevice.isSimulated) {
//             return res.status(403).json({ message: 'Only simulated devices can be deleted' });
//         }

//         if (existingDevice.status === 'loading') {
//             return res.status(409).json({ message: 'Cannot delete a device while it is loading' });
//         }

//         await Device.findByIdAndUpdate(existingDevice._id, {
//             $set: {
//                 isDeleted: true,
//                 deletedAt: new Date(),
//                 status: 'off',
//             },
//         });

//         return res.json({
//             message: 'Device deleted successfully',
//             deviceId,
//         });
//     } catch (error) {
//         console.error('Failed to delete simulated device:', error.message);
//         return res.status(500).json({ message: 'Failed to delete simulated device' });
//     }
// }

async function controlDevice(req, res) {
    const requestedDeviceName = String(req.body.deviceName || '').toLowerCase().trim();
    const normalizedStaticDevice = normalizeDeviceId(requestedDeviceName);
    const normalizedCustomDevice = toSlug(requestedDeviceName);
    const deviceName = normalizedStaticDevice || normalizedCustomDevice;
    const action = String(req.body.action || '').toLowerCase().trim();

    if (!deviceName) {
        return res.status(400).json({ message: 'deviceName is required' });
    }
    if (!VALID_ACTIONS.includes(action)) {
        return res.status(400).json({ message: 'action must be "on" or "off"' });
    }

    try {
        const isStaticDevice = DEVICE_IDS.includes(deviceName);
        let existingDevice = await Device.findOne({ name: deviceName, isDeleted: { $ne: true } }).lean();

        if (!existingDevice && !isStaticDevice) {
            return res.status(400).json({ message: `Unknown device: ${deviceName}` });
        }

        if (!existingDevice && isStaticDevice) {
            const defaultMeta = getDefaultDeviceMeta(deviceName);
            existingDevice = await Device.findOneAndUpdate(
                { name: deviceName },
                {
                    $setOnInsert: {
                        name: deviceName,
                        label: defaultMeta.label,
                        dashboardType: defaultMeta.dashboardType,
                        dashboardIcon: defaultMeta.dashboardIcon,
                        actionIcon: defaultMeta.actionIcon,
                        isSimulated: false,
                        status: 'off',
                    },
                    $set: {
                        label: defaultMeta.label,
                        dashboardType: defaultMeta.dashboardType,
                        dashboardIcon: defaultMeta.dashboardIcon,
                        actionIcon: defaultMeta.actionIcon,
                        isDeleted: false,
                        deletedAt: null,
                        status: 'off',
                    },
                },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            ).lean();
        }

        const previousStatus = existingDevice?.status || 'off';

        if (previousStatus === 'loading') {
            return res.status(409).json({ message: `Device ${deviceName} already has a pending command, please wait` });
        }

        const actionDoc = await ActionHistory.create({
            idDevice: existingDevice._id,
            action,
            status: 'loading',
            time: new Date(),
        });

        await Device.findByIdAndUpdate(
            existingDevice._id,
            { status: 'loading' },
            { new: false }
        );

        if (existingDevice.isSimulated) {
            setTimeout(() => {
                Promise.all([
                    ActionHistory.findByIdAndUpdate(actionDoc._id, { status: 'success' }),
                    Device.findByIdAndUpdate(existingDevice._id, { status: action }),
                ]).catch((e) => {
                    console.error('Failed to apply simulated device status:', e.message);
                });
            }, 650);

            return res.json({ success: true, actionId: actionDoc._id, simulated: true });
        }
        //public action/device
        mqttService.publishControl(deviceName, action);
        //peding timeout
        mqttService.registerPendingCommand(deviceName, actionDoc._id, previousStatus);

        return res.json({ success: true, actionId: actionDoc._id });
    } catch (error) {
        console.error('Device control error:', error.message);
        return res.status(500).json({ message: 'Failed to process device control command' });
    }
}

module.exports = {
    getDevices,
    // addDevice,
    // deleteDevice,
    controlDevice,
};
