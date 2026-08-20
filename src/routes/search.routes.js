'use strict';
const express = require('express');
const router = express.Router();
const searchCtrl = require('../controllers/search.controller');
const authenticate = require('../middleware/authenticate');
const env = require('../config/env');

// Search routes are Tier 2 — only available when Workspace features are enabled.
// When disabled, return an explicit "unavailable" rather than 404.
const tier2Guard = (_req, res, next) => {
  if (!env.WORKSPACE_FEATURES_ENABLED) {
    return res.status(200).json({
      status: 'unavailable',
      message: 'Search requires WORKSPACE_FEATURES_ENABLED=true.',
    });
  }
  next();
};

router.get('/transcripts', authenticate, tier2Guard, searchCtrl.searchTranscripts);
router.get('/summaries',   authenticate, tier2Guard, searchCtrl.searchSummaries);

module.exports = router;
