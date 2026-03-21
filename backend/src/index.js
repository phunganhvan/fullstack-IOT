require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mqttService = require('./services/mqttService');
const mongoService = require('./services/mongoService');
const Device = require('./model/device.model');
const ActionHistory = require('./model/actionHistory.model');
const Sensor = require('./model/sensor.model');
const DataSensor = require('./model/dataSensor.model');
const { DEVICE_IDS, normalizeDeviceId } = require('./constants/devices');
const { SENSOR_LIST, normalizeSensorKey } = require('./constants/sensors');

const sensorRoutes = require('./routes/sensorRoutes');
const deviceRoutes = require('./routes/deviceRoutes');
const actionRoutes = require('./routes/actionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sensors', sensorRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/actions', actionRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mqtt: mqttService.isConnected() ? 'connected' : 'disconnected',
    mongo: mongoService.isMongoConnected() ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

async function seedDefaultSensors() {
  if (!mongoService.isMongoConnected()) return;

  const operations = SENSOR_LIST.map((sensor) => ({
    updateOne: {
      filter: { name: sensor.name },
      update: {
        $setOnInsert: {
          name: sensor.name,
          unit: sensor.unit,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  try {
    if (operations.length) {
      await Sensor.bulkWrite(operations, { ordered: false });
      console.log(`[mongo] Ensured ${operations.length} sensor definition(s)`);
    }
  } catch (error) {
    console.error('Failed to seed sensors:', error.message);
  }
}

async function backfillSensorAuditFields() {
  if (!mongoService.isMongoConnected()) return;

  try {
    const legacySensors = await Sensor.collection
      .find(
        {
          $or: [
            { createdBy: { $exists: true } },
            { updatedBy: { $exists: true } },
            { createdAt: { $exists: false } },
            { updatedAt: { $exists: false } },
          ],
        },
        { projection: { _id: 1, createdAt: 1, updatedAt: 1 } }
      )
      .toArray();

    const operations = legacySensors.map((doc) => {
      const createdAt = doc.createdAt || new Date();
      const updatedAt = doc.updatedAt || createdAt;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: { createdAt, updatedAt },
            $unset: { createdBy: '', updatedBy: '' },
          },
        },
      };
    });

    if (!operations.length) return;

    await Sensor.bulkWrite(operations, { ordered: false });
    console.log(`[mongo] Backfilled sensor audit fields for ${operations.length} record(s)`);
  } catch (error) {
    console.error('Failed to backfill Sensor audit fields:', error.message);
  }
}

async function migrateLegacyDevicesToNameField() {
  if (!mongoService.isMongoConnected()) return;

  try {
    const legacyDevices = await Device.collection
      .find({ idDevice: { $exists: true, $type: 'string' } }, { projection: { _id: 1, idDevice: 1, name: 1 } })
      .toArray();

    const operations = legacyDevices
      .map((doc) => {
        const normalizedName = normalizeDeviceId(doc.name || doc.idDevice);
        if (!normalizedName) return null;

        return {
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: { name: normalizedName },
              $unset: { idDevice: '' },
            },
          },
        };
      })
      .filter(Boolean);

    if (!operations.length) return;

    await Device.bulkWrite(operations, { ordered: false });
    console.log(`[mongo] Migrated ${operations.length} legacy device record(s) to name field`);
  } catch (error) {
    console.error('Failed to migrate legacy Device.idDevice field:', error.message);
  }
}

async function seedDefaultDevices() {
  if (!mongoService.isMongoConnected()) return;

  const operations = DEVICE_IDS.map((deviceName) => ({
    updateOne: {
      filter: { name: deviceName },
      update: {
        $setOnInsert: {
          name: deviceName,
          status: 'off',
          updatedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  try {
    if (!operations.length) return;
    await Device.bulkWrite(operations, { ordered: false });
    console.log(`[mongo] Ensured ${operations.length} device definition(s)`);
  } catch (error) {
    console.error('Failed to seed devices:', error.message);
  }
}

async function backfillDeviceAuditFields() {
  if (!mongoService.isMongoConnected()) return;

  try {
    const legacyDevices = await Device.collection
      .find(
        {
          $or: [
            { createdAt: { $exists: false } },
            { updatedAt: { $exists: false } },
            { isDeleted: { $exists: false } },
            { deletedAt: { $exists: false } },
          ],
        },
        { projection: { _id: 1, createdAt: 1, updatedAt: 1, isDeleted: 1, deletedAt: 1 } }
      )
      .toArray();

    const operations = legacyDevices.map((doc) => {
      const createdAt = doc.createdAt || new Date();
      const updatedAt = doc.updatedAt || createdAt;
      const isDeleted = doc.isDeleted === true;
      const deletedAt = isDeleted ? doc.deletedAt || new Date() : null;

      return {
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: { createdAt, updatedAt, isDeleted, deletedAt },
          },
        },
      };
    });

    if (!operations.length) return;

    await Device.bulkWrite(operations, { ordered: false });
    console.log(`[mongo] Backfilled device audit fields for ${operations.length} record(s)`);
  } catch (error) {
    console.error('Failed to backfill Device audit fields:', error.message);
  }
}

async function backfillLegacyActionDeviceRefs() {
  if (!mongoService.isMongoConnected()) return;

  try {
    const deviceDocs = await Device.find({ name: { $in: DEVICE_IDS } }).select('_id name').lean();
    const deviceIdByName = new Map(deviceDocs.map((doc) => [doc.name, doc._id]));

    const legacyActionDocs = await ActionHistory.collection
      .find({ idDevice: { $exists: true, $type: 'string' } }, { projection: { _id: 1, idDevice: 1 } })
      .toArray();

    const operations = legacyActionDocs
      .map((doc) => {
        const normalizedName = normalizeDeviceId(doc.idDevice);
        if (!normalizedName) return null;

        const deviceObjectId = deviceIdByName.get(normalizedName);
        if (!deviceObjectId) return null;

        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { idDevice: deviceObjectId } },
          },
        };
      })
      .filter(Boolean);

    if (!operations.length) return;

    await ActionHistory.bulkWrite(operations, { ordered: false });
    console.log(`[mongo] Backfilled idDevice for ${operations.length} legacy action history record(s)`);
  } catch (error) {
    console.error('Failed to backfill legacy ActionHistory idDevice:', error.message);
  }
}

async function backfillLegacySensorIds() {
  if (!mongoService.isMongoConnected()) return;

  try {
    const sensorDocs = await Sensor.find({}).select('_id name').lean();
    const sensorIdByKey = new Map();
    sensorDocs.forEach((sensorDoc) => {
      const sensorKey = normalizeSensorKey(sensorDoc.name);
      if (!sensorKey) return;
      if (!sensorIdByKey.has(sensorKey)) {
        sensorIdByKey.set(sensorKey, sensorDoc._id);
      }
    });

    const legacyDocs = await DataSensor.find({
      $or: [{ idSensor: { $exists: false } }, { idSensor: null }, { idSensor: { $type: 'string' } }],
      sensorName: { $exists: true, $ne: '' },
    })
      .select('_id sensorName')
      .lean();

    const operations = legacyDocs
      .map((doc) => {
        const sensorKey = normalizeSensorKey(doc.sensorName);
        if (!sensorKey) return null;

        const sensorObjectId = sensorIdByKey.get(sensorKey);
        if (!sensorObjectId) return null;

        return {
          updateOne: {
            filter: { _id: doc._id },
            update: { $set: { idSensor: sensorObjectId } },
          },
        };
      })
      .filter(Boolean);

    if (!operations.length) return;

    await DataSensor.bulkWrite(operations, { ordered: false });
    console.log(`[mongo] Backfilled idSensor for ${operations.length} legacy data point(s)`);
  } catch (error) {
    console.error('Failed to backfill legacy DataSensor idSensor:', error.message);
  }
}

async function startServer() {
  await mongoService.connectMongo();
  await migrateLegacyDevicesToNameField();
  await backfillDeviceAuditFields();
  await seedDefaultDevices();
  await backfillLegacyActionDeviceRefs();
  await backfillSensorAuditFields();
  await seedDefaultSensors();
  await backfillLegacySensorIds();
  mqttService.connect();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start backend:', error.message);
  process.exit(1);
});

module.exports = app;
