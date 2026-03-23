const express = require('express');
const router = express.Router();
const {
    addSensor,
    deleteSensor,
    getSensorPackets,
    getLatestSensorPacket,
    getSensors,
} = require('../controllers/sensor.controller');

router.get('/packets', getSensorPackets);
router.get('/latest', getLatestSensorPacket);
// router.post('/', addSensor);
// router.delete('/:sensorKey', deleteSensor);
router.get('/', getSensors);

module.exports = router;
