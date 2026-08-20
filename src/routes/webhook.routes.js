'use strict';
const express = require('express');
const router = express.Router();
const webhookCtrl = require('../controllers/webhook.controller');
const env = require('../config/env');

/**
 * Pub/Sub push endpoint.
 *
 * This route is only mounted when WORKSPACE_FEATURES_ENABLED=true.
 * When Tier 2 is disabled the entire router module is not loaded, so
 * any probe to this URL gets a 404 — safe and explicit.
 *
 * Google pushes to this endpoint; no JWT auth is used here.
 * Instead, an OIDC token in the Authorization header is verified
 * against Google's public keys inside the controller.
 */
if (env.WORKSPACE_FEATURES_ENABLED) {
  router.post('/pubsub/meeting-events', webhookCtrl.handlePubSubPush);
}

module.exports = router;
