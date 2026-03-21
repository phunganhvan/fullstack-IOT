const mqttService = require('../services/mqttService');
const ActionHistory = require('../model/actionHistory.model');
const Device = require('../model/device.model');
const { DEVICE_IDS, PUBLIC_DEVICE_LIST } = require('../constants/devices');

const VALID_ACTIONS = ['on', 'off'];

async function getDevices(req, res) {
  try {
    const docs = await Device.find({ name: { $in: DEVICE_IDS } }).lean();
    const result = {};
    DEVICE_IDS.forEach((id) => {
      const doc = docs.find((d) => d.name === id);
      result[id] = { status: doc ? doc.status : 'off' };
    });
    return res.json({ data: result, deviceList: PUBLIC_DEVICE_LIST });
  } catch (error) {
    console.error('Failed to get device states:', error.message);
    return res.status(500).json({ message: 'Failed to get device states' });
  }
}

async function controlDevice(req, res) {
  const deviceName = String(req.body.deviceName || '').toLowerCase().trim();
  const action = String(req.body.action || '').toLowerCase().trim();

  if (!DEVICE_IDS.includes(deviceName)) {
    return res.status(400).json({ message: `deviceName must be one of: ${DEVICE_IDS.join(', ')}` });
  }
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ message: 'action must be "on" or "off"' });
  }

  try {
    const existingDevice = await Device.findOneAndUpdate(
      { name: deviceName },
      {
        $setOnInsert: {
          name: deviceName,
          status: 'off',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

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

    mqttService.publishControl(deviceName, action);
    mqttService.registerPendingCommand(deviceName, actionDoc._id, previousStatus);

    return res.json({ success: true, actionId: actionDoc._id });
  } catch (error) {
    console.error('Device control error:', error.message);
    return res.status(500).json({ message: 'Failed to process device control command' });
  }
}

module.exports = {
  getDevices,
  controlDevice,
};
