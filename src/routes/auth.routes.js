'use strict';
const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const authSchemas = require('../validations/auth.validation');

// Redirect user to Google consent screen
router.get('/google', authCtrl.redirectToGoogle);

// Google OAuth callback — exchange code, upsert user, issue JWT
router.get('/google/callback', validate(authSchemas.googleCallback), authCtrl.googleCallback);

// Get current authenticated user profile
router.get('/me', authenticate, authCtrl.getMe);

// Logout (stateless — client discards tokens; extend here for blocklist)
router.post('/logout', authenticate, authCtrl.logout);

// Exchange a refresh token for a new access+refresh token pair
router.post('/refresh', validate(authSchemas.refresh), authCtrl.refreshTokens);

module.exports = router;
