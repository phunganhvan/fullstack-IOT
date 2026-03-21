const express = require('express');
const router = express.Router();
const { getDevices, controlDevice } = require('../controllers/device.controller');

router.get('/', getDevices);
router.post('/control', controlDevice);

module.exports = router;
