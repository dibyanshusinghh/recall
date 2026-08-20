'use strict';
const express = require('express');
const router = express.Router();
const availCtrl = require('../controllers/availability.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const availSchemas = require('../validations/availability.validation');

// GET  /users/:id/availability-rules
router.get(
  '/:id/availability-rules',
  authenticate,
  validate(availSchemas.getRules),
  availCtrl.getRules
);

// PUT  /users/:id/availability-rules  (full replace — idempotent)
router.put(
  '/:id/availability-rules',
  authenticate,
  validate(availSchemas.putRules),
  availCtrl.replaceRules
);

module.exports = router;
