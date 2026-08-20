/**
 * tests/setup.env.js — runs via jest setupFiles (before the test framework
 * is installed and before any production module is loaded).
 *
 * All required env vars are set here so that src/config/env.js passes
 * validation and no real external services are needed.
 *
 * dotenv.config() called later by src/config/env.js respects pre-set vars
 * (it never overwrites existing process.env values), so the real .env file
 * on disk will not interfere with test runs.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';

// ── Database ──────────────────────────────────────────────────────────────────
// pg module is mocked in individual test files; this value just satisfies
// the env validation in src/config/env.js.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/recall_test';

// ── Redis ─────────────────────────────────────────────────────────────────────
process.env.REDIS_URL = 'redis://localhost:6379';

// ── JWT ───────────────────────────────────────────────────────────────────────
// Must be at least 32 chars for HS256 to be meaningful in test assertions.
process.env.JWT_SECRET = 'test-jwt-secret-must-be-long-enough-for-hs256-testing-purposes';
process.env.JWT_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';

// ── Encryption ────────────────────────────────────────────────────────────────
// 64 hex chars = 32-byte key required by AES-256-GCM.
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

// ── Google OAuth ──────────────────────────────────────────────────────────────
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/auth/google/callback';

// ── Tier 2 (enabled so webhook/search routes are registered) ──────────────────
process.env.WORKSPACE_FEATURES_ENABLED = 'true';
process.env.GOOGLE_PROJECT_ID = 'test-project-id';
process.env.PUBSUB_TOPIC_NAME = 'test-meeting-events';
process.env.PUBSUB_SUBSCRIPTION_NAME = 'test-meeting-events-sub';
process.env.GOOGLE_PUBSUB_AUDIENCE = 'https://test.example.com/webhooks/pubsub/meeting-events';

// ── Misc ──────────────────────────────────────────────────────────────────────
process.env.SLOT_HOLD_TTL_SECONDS = '600';
process.env.CORS_ORIGIN = 'http://localhost:3001';
