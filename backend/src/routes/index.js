const express = require('express');

const dashboardRoutes = require('./dashboardRoutes');
const sensorRoutes = require('./sensorRoutes');
const deviceRoutes = require('./deviceRoutes');
const actionRoutes = require('./actionRoutes');

const router = express.Router();

router.use('/dashboard', dashboardRoutes);
router.use('/sensors', sensorRoutes);
router.use('/devices', deviceRoutes);
router.use('/actions', actionRoutes);

module.exports = router;