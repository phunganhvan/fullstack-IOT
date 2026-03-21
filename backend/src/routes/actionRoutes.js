const express = require('express');
const router = express.Router();
const { getActions } = require('../controllers/action.controller');

router.get('/', getActions);

module.exports = router;
