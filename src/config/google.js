'use strict';
const { google } = require('googleapis');
const env = require('./env');

// ─── Tier 1 scopes (always requested) ────────────────────────────────────────
const TIER1_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// ─── Tier 2 scopes (only when WORKSPACE_FEATURES_ENABLED=true) ───────────────
// These scopes grant access to Meet recordings/transcripts, Drive files, and
// Google Docs. They require a Google Workspace account with Gemini enabled.
const TIER2_SCOPES = [
  'https://www.googleapis.com/auth/meet.recordings.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
];

const SCOPES = env.WORKSPACE_FEATURES_ENABLED
  ? [...TIER1_SCOPES, ...TIER2_SCOPES]
  : TIER1_SCOPES;

/**
 * Create a new OAuth2 client with Recall's credentials.
 * Each request to Google APIs should use its own client instance
 * (or set credentials per-request) to avoid credential leakage.
 */
function createOAuth2Client() {
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );
}

/**
 * Build the Google consent screen URL.
 * `access_type: 'offline'` is required to receive a refresh_token.
 * `prompt: 'consent'` forces the consent screen every time so we always
 * receive a fresh refresh_token (important for re-auth flows).
 */
function getAuthUrl(state) {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

/**
 * Exchange an authorization code for tokens.
 * @param {string} code
 * @returns {Promise<import('google-auth-library').Credentials>}
 */
async function exchangeCode(code) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Create an authorized OAuth2 client from stored (decrypted) tokens.
 * Automatically refreshes the access token when expired.
 * @param {{ refreshToken: string, accessToken?: string, tokenExpiry?: Date }} tokens
 */
function createAuthorizedClient(tokens) {
  const client = createOAuth2Client();
  client.setCredentials({
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken,
    expiry_date: tokens.tokenExpiry ? new Date(tokens.tokenExpiry).getTime() : undefined,
  });
  return client;
}

module.exports = {
  createOAuth2Client,
  createAuthorizedClient,
  getAuthUrl,
  exchangeCode,
  SCOPES,
  TIER1_SCOPES,
  TIER2_SCOPES,
};
