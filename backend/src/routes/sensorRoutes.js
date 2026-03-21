const express = require('express');
const router = express.Router();
const {
  getSensorPackets,
  getLatestSensorPacket,
  getSensors,
} = require('../controllers/sensor.controller');

router.get('/packets', getSensorPackets);
router.get('/latest', getLatestSensorPacket);
router.get('/', getSensors);

module.exports = router;
