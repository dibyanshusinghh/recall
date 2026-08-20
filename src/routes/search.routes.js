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

/**
 * @openapi
 * /search/transcripts:
 *   get:
 *     summary: Full-text search across meeting transcripts (Tier 2)
 *     description: >
 *       Queries the `recall.transcripts.search_vector` GIN index using
 *       `plainto_tsquery('english', ...)`, scoped to meetings where the
 *       authenticated user is the organizer. Results are ranked by `ts_rank`.
 *
 *       **Tier 2 — requires `WORKSPACE_FEATURES_ENABLED=true`.**
 *       Returns `{ status: "unavailable" }` (HTTP 200) when disabled.
 *     tags: [Search]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *           maxLength: 500
 *         description: Full-text search query.
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+$'
 *         description: Organizer user ID to scope the search.
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Ranked transcript matches or unavailable response.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/TranscriptSearchResult'
 *                 - $ref: '#/components/schemas/Tier2Unavailable'
 *       400:
 *         description: Validation error (e.g. query too short).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/transcripts', authenticate, tier2Guard, searchCtrl.searchTranscripts);

/**
 * @openapi
 * /search/summaries:
 *   get:
 *     summary: Full-text search across meeting summaries (Tier 2)
 *     description: >
 *       Queries the `recall.summaries.search_vector` GIN index using
 *       `plainto_tsquery('english', ...)`, scoped to the organizer.
 *       Results are ranked by `ts_rank`.
 *
 *       **Tier 2 — requires `WORKSPACE_FEATURES_ENABLED=true`.**
 *       Returns `{ status: "unavailable" }` (HTTP 200) when disabled.
 *     tags: [Search]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 2
 *       - in: query
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d+$'
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 50
 *     responses:
 *       200:
 *         description: Ranked summary matches or unavailable response.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       example: success
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SummarySearchResult'
 *                 - $ref: '#/components/schemas/Tier2Unavailable'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/summaries',   authenticate, tier2Guard, searchCtrl.searchSummaries);

module.exports = router;
