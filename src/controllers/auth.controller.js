'use strict';
const authService = require('../services/auth.service');
const googleConfig = require('../config/google');
const userRepo = require('../repositories/user.repository');
const asyncHandler = require('../utils/asyncHandler');

const redirectToGoogle = asyncHandler(async (req, res) => {
  // Optionally persist state for CSRF protection
  const state = req.query.state || undefined;
  const url = googleConfig.getAuthUrl(state);
  res.redirect(url);
});

const googleCallback = asyncHandler(async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ status: 'error', message: `Google OAuth error: ${error}` });
  }

  const result = await authService.handleOAuthCallback(code);
  res.status(200).json({ status: 'success', data: result });
});

const getMe = asyncHandler(async (req, res) => {
  const user = await userRepo.findById(req.user.id);
  if (!user) return res.status(404).json({ status: 'error', message: 'User not found' });

  const profile = await userRepo.getUserProfile(req.user.id);
  res.status(200).json({
    status: 'success',
    data: {
      id: user.id,
      email: user.email,
      username: user.username,
      avatarUrl: profile?.avatar_url,
      timezone: profile?.timezone,
    },
  });
});

const logout = asyncHandler(async (req, res) => {
  // JWTs are stateless — instruct the client to discard both tokens.
  // For token invalidation add the JTI to a Redis blocklist here.
  res.status(200).json({ status: 'success', message: 'Logged out successfully.' });
});

const refreshTokens = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  const result = await authService.refreshTokens(refreshToken);
  res.status(200).json({ status: 'success', data: result });
});

module.exports = { redirectToGoogle, googleCallback, getMe, logout, refreshTokens };
