'use strict';
/**
 * tests/unit/services/auth.service.test.js
 *
 * OAuth callback must persist identity in recall.users (via upsertUser),
 * not public.users. JWT issuance and Google token encryption are unchanged.
 */

jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({
  on: jest.fn().mockReturnThis(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
})));

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: jest.fn(), close: jest.fn() })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: jest.fn() })),
}));

jest.mock('pg', () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
    connect: jest.fn().mockResolvedValue({ query: jest.fn(), release: jest.fn() }),
    on: jest.fn(),
    end: jest.fn(),
  })),
}));

const mockClient = { query: jest.fn() };
jest.mock('../../../src/config/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  transaction: jest.fn((fn) => fn(mockClient)),
  getClient: jest.fn(),
  connectDb: jest.fn(),
}));

const mockExchangeCode = jest.fn();
const mockCreateOAuth2Client = jest.fn();
jest.mock('../../../src/config/google', () => ({
  exchangeCode: (...args) => mockExchangeCode(...args),
  createOAuth2Client: (...args) => mockCreateOAuth2Client(...args),
  createAuthorizedClient: jest.fn(),
}));

const mockUserinfoGet = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    oauth2: jest.fn(() => ({
      userinfo: { get: mockUserinfoGet },
    })),
  },
}));

const mockUpsertUser = jest.fn();
const mockUpsertUserProfile = jest.fn();
const mockUpsertGoogleCredentials = jest.fn();
const mockFindById = jest.fn();
jest.mock('../../../src/repositories/user.repository', () => ({
  upsertUser: (...args) => mockUpsertUser(...args),
  upsertUserProfile: (...args) => mockUpsertUserProfile(...args),
  upsertGoogleCredentials: (...args) => mockUpsertGoogleCredentials(...args),
  findById: (...args) => mockFindById(...args),
  getGoogleCredentials: jest.fn(),
  getUserProfile: jest.fn(),
  findByEmail: jest.fn(),
}));

jest.mock('../../../src/utils/encryption', () => ({
  encrypt: (v) => `enc:${v}`,
  decrypt: (v) => v.replace(/^enc:/, ''),
}));

const { handleOAuthCallback, refreshTokens } = require('../../../src/services/auth.service');

const RECALL_USER = { id: '42', email: 'alice@example.com', username: 'Alice' };

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateOAuth2Client.mockReturnValue({ setCredentials: jest.fn() });
  mockExchangeCode.mockResolvedValue({
    refresh_token: 'rt',
    access_token: 'at',
    expiry_date: Date.now() + 3600_000,
    scope: 'openid email profile',
  });
  mockUserinfoGet.mockResolvedValue({
    data: {
      id: 'google-123',
      email: 'alice@example.com',
      name: 'Alice',
      picture: 'https://example.com/a.png',
    },
  });
  mockUpsertUser.mockResolvedValue(RECALL_USER);
  mockUpsertUserProfile.mockResolvedValue({});
  mockUpsertGoogleCredentials.mockResolvedValue({});
});

describe('handleOAuthCallback — recall.users identity', () => {
  it('upserts recall.users (via upsertUser) and returns JWTs', async () => {
    const result = await handleOAuthCallback('auth-code');

    expect(mockUpsertUser).toHaveBeenCalledTimes(1);
    expect(mockUpsertUser).toHaveBeenCalledWith(
      mockClient,
      { email: 'alice@example.com', username: 'Alice' }
    );
    expect(mockUpsertUserProfile).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ userId: '42', googleId: 'google-123' })
    );
    expect(mockUpsertGoogleCredentials).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ userId: '42' })
    );

    expect(result.user).toEqual({
      id: '42',
      email: 'alice@example.com',
      username: 'Alice',
    });
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('uses email prefix as username when Google name is missing', async () => {
    mockUserinfoGet.mockResolvedValueOnce({
      data: { id: 'google-123', email: 'bob@example.com' },
    });
    mockUpsertUser.mockResolvedValueOnce({
      id: '7',
      email: 'bob@example.com',
      username: 'bob',
    });

    await handleOAuthCallback('auth-code');

    expect(mockUpsertUser).toHaveBeenCalledWith(
      mockClient,
      { email: 'bob@example.com', username: 'bob' }
    );
  });

  it('throws 400 when Google profile has no email', async () => {
    mockUserinfoGet.mockResolvedValueOnce({
      data: { id: 'google-123', email: null },
    });

    await expect(handleOAuthCallback('auth-code')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(mockUpsertUser).not.toHaveBeenCalled();
  });
});

describe('refreshTokens', () => {
  it('issues a new pair when recall.users still has the subject', async () => {
    const { signRefreshToken } = require('../../../src/services/auth.service');
    const token = signRefreshToken(RECALL_USER);
    mockFindById.mockResolvedValueOnce(RECALL_USER);

    const result = await refreshTokens(token);

    expect(mockFindById).toHaveBeenCalledWith('42');
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('throws 404 when the Recall user no longer exists', async () => {
    const { signRefreshToken } = require('../../../src/services/auth.service');
    const token = signRefreshToken(RECALL_USER);
    mockFindById.mockResolvedValueOnce(null);

    await expect(refreshTokens(token)).rejects.toMatchObject({ statusCode: 404 });
  });
});
