'use strict';
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const env = require('../config/env');
const googleConfig = require('../config/google');
const db = require('../config/db');
const userRepo = require('../repositories/user.repository');
const { encrypt, decrypt } = require('../utils/encryption');
const AppError = require('../utils/AppError');

/**
 * Sign an access JWT.
 *
 * Algorithm: HS256 with JWT_SECRET.
 * The Notify Spring Boot service can verify these tokens using the same
 * JWT_SECRET value, e.g.:
 *
 *   Jwts.parserBuilder()
 *     .setSigningKey(Keys.hmacShaKeyFor(jwtSecret.getBytes()))
 *     .build()
 *     .parseClaimsJws(token);
 *
 * For higher security in production, switch to RS256:
 *   - Generate a keypair: openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem
 *   - Sign here with the private key (JWT_PRIVATE_KEY env var)
 *   - Share the public key (JWT_PUBLIC_KEY env var) with Notify
 */
function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: env.JWT_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, type: 'refresh' },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
}

/**
 * Handle the Google OAuth callback.
 * Ordering:
 *  1. Exchange auth code for Google tokens
 *  2. Fetch user info from Google
 *  3. Upsert public.users (Notify's table) — transactional with SELECT FOR UPDATE to avoid races
 *  4. Upsert recall.user_profiles + recall.google_credentials
 *  5. Issue Recall JWTs
 *
 * NOTE on public.users race condition: we use INSERT ... ON CONFLICT to
 * handle concurrent first-time logins atomically at the DB level.
 */
async function handleOAuthCallback(code) {
  // Step 1: Exchange authorization code
  const tokens = await googleConfig.exchangeCode(code);

  // Step 2: Fetch Google user profile
  const oauth2Client = googleConfig.createOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data: profile } = await oauth2.userinfo.get();

  const { id: googleId, email, name, picture: avatarUrl } = profile;
  if (!email) throw new AppError('Google account has no email address', 400);

  // `name` from Google is used as the Notify `username` field.
  // If Google provides no name, fall back to the email prefix.
  const username = name || email.split('@')[0];

  // Steps 3+4: Upsert in a single DB transaction
  const user = await db.transaction(async (client) => {
    // Upsert public.users (Notify's table)
    const publicUser = await userRepo.upsertPublicUser(client, { email, username });

    // Upsert recall-specific profile
    await userRepo.upsertUserProfile(client, {
      userId: publicUser.id,
      googleId,
      avatarUrl,
      timezone: 'UTC', // user can update timezone via availability-rules endpoint
    });

    // Encrypt and persist OAuth tokens
    const refreshTokenEncrypted = encrypt(tokens.refresh_token);
    const accessTokenEncrypted = tokens.access_token ? encrypt(tokens.access_token) : null;
    const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

    await userRepo.upsertGoogleCredentials(client, {
      userId: publicUser.id,
      refreshTokenEncrypted,
      accessTokenEncrypted,
      tokenExpiry,
      scopes: tokens.scope ? tokens.scope.split(' ') : [],
    });

    return publicUser;
  });

  // Step 5: Issue Recall JWTs
  return {
    user: { id: user.id, email: user.email, username: user.username },
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

async function refreshTokens(refreshToken) {
  let payload;
  try {
    payload = verifyToken(refreshToken);
  } catch {
    throw new AppError('Invalid or expired refresh token', 401);
  }

  if (payload.type !== 'refresh') {
    throw new AppError('Token is not a refresh token', 401);
  }

  const user = await userRepo.findById(payload.sub);
  if (!user) throw new AppError('User not found', 404);

  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

/**
 * Get an authorized Google API client for a user.
 * Decrypts stored tokens from the DB.
 */
async function getAuthorizedGoogleClient(userId) {
  const creds = await userRepo.getGoogleCredentials(userId);
  if (!creds) throw new AppError('No Google credentials found. Please reconnect your account.', 401);

  const refreshToken = decrypt(creds.refresh_token_encrypted);
  const accessToken = creds.access_token_encrypted ? decrypt(creds.access_token_encrypted) : null;

  return googleConfig.createAuthorizedClient({
    refreshToken,
    accessToken,
    tokenExpiry: creds.token_expiry,
  });
}

module.exports = {
  handleOAuthCallback,
  refreshTokens,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  getAuthorizedGoogleClient,
};
