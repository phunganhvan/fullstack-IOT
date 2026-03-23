const express = require('express');
const router = express.Router();
const { getDevices, controlDevice } = require('../controllers/device.controller');

router.get('/', getDevices);
// router.post('/', addDevice);
router.post('/control', controlDevice);
// router.delete('/:deviceId', deleteDevice);

module.exports = router;
