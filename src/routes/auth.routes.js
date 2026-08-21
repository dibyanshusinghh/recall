'use strict';
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const authSchemas = require('../validations/auth.validation');

/**
 * @openapi
 * /auth/google:
 *   get:
 *     summary: Redirect to Google OAuth consent screen
 *     description: >
 *       Initiates the Google OAuth 2.0 authorization code flow.
 *       The browser is redirected to Google's consent screen where the user
 *       approves the requested scopes. Tier 2 scopes (Meet/Drive/Docs) are
 *       added automatically when `WORKSPACE_FEATURES_ENABLED=true`.
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Optional CSRF state token echoed back in the callback.
 *     responses:
 *       302:
 *         description: Redirect to Google consent screen.
 */
router.get('/google', authCtrl.redirectToGoogle);

/**
 * @openapi
 * /auth/google/callback:
 *   get:
 *     summary: Google OAuth callback — exchange code for JWT
 *     description: >
 *       Google redirects here after the user approves the consent screen.
 *       Exchanges the authorization code for Google tokens, upserts the user
 *       in `recall.users` and `recall.user_profiles`, stores
 *       encrypted credentials, and returns Recall JWTs.
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Google.
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *       - in: query
 *         name: error
 *         schema:
 *           type: string
 *         description: Set by Google when the user denied access.
 *     responses:
 *       200:
 *         description: Authentication successful — returns user profile and JWT pair.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/AuthTokens'
 *       400:
 *         description: Missing code or Google returned an error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       502:
 *         description: Upstream Google API error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/google/callback', validate(authSchemas.googleCallback), authCtrl.googleCallback);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User profile.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', authenticate, authCtrl.getMe);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Logout (stateless — client must discard both tokens)
 *     description: >
 *       The API is stateless; no server-side session is invalidated.
 *       Clients should discard the access and refresh tokens upon receipt
 *       of this response. Extend this endpoint to add tokens to a Redis
 *       blocklist for true invalidation.
 *     tags: [Auth]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logout acknowledged.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *       401:
 *         description: Missing or invalid JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/logout', authenticate, authCtrl.logout);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using a refresh token
 *     description: >
 *       Exchange a valid refresh JWT for a new access + refresh token pair.
 *       The refresh token is also rotated on each call.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: The refresh JWT previously issued by this API.
 *     responses:
 *       200:
 *         description: New token pair issued.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *       401:
 *         description: Invalid or expired refresh token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/refresh', validate(authSchemas.refresh), authCtrl.refreshTokens);

module.exports = router;
