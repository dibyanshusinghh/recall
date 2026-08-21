'use strict';
/**
 * tests/unit/repositories/user.repository.test.js
 *
 * Identity SQL targets recall.users (not public.users).
 * db.query / client.query are mocked — no real Postgres.
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

const mockQuery = jest.fn();
jest.mock('../../../src/config/db', () => ({
  query: (...args) => mockQuery(...args),
  transaction: jest.fn(),
  getClient: jest.fn(),
  connectDb: jest.fn(),
}));

const userRepo = require('../../../src/repositories/user.repository');

const USER_ROW = {
  id: '42',
  email: 'alice@example.com',
  username: 'Alice',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('user.repository — recall.users', () => {
  describe('findByEmail', () => {
    it('queries recall.users by email', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [USER_ROW] });

      const result = await userRepo.findByEmail('alice@example.com');

      expect(result).toEqual(USER_ROW);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/FROM recall\.users WHERE email/i),
        ['alice@example.com']
      );
      expect(mockQuery.mock.calls[0][0]).not.toMatch(/public\.users/);
    });

    it('returns null when no row matches', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(userRepo.findByEmail('missing@example.com')).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('queries recall.users by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [USER_ROW] });

      const result = await userRepo.findById('42');

      expect(result).toEqual(USER_ROW);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/FROM recall\.users WHERE id/i),
        ['42']
      );
      expect(mockQuery.mock.calls[0][0]).not.toMatch(/public\.users/);
    });
  });

  describe('upsertUser', () => {
    it('inserts into recall.users on conflict of email', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [USER_ROW] }) };

      const result = await userRepo.upsertUser(client, {
        email: 'alice@example.com',
        username: 'Alice',
      });

      expect(result).toEqual(USER_ROW);
      const sql = client.query.mock.calls[0][0];
      expect(sql).toMatch(/INSERT INTO recall\.users/i);
      expect(sql).toMatch(/ON CONFLICT \(email\)/i);
      expect(sql).not.toMatch(/public\.users/);
      expect(sql).not.toMatch(/password_hash/);
      expect(sql).not.toMatch(/\brole\b/);
      expect(client.query).toHaveBeenCalledWith(sql, ['alice@example.com', 'Alice']);
    });

    it('falls back to email prefix when username is omitted', async () => {
      const client = { query: jest.fn().mockResolvedValue({ rows: [USER_ROW] }) };

      await userRepo.upsertUser(client, { email: 'bob@example.com' });

      expect(client.query.mock.calls[0][1]).toEqual(['bob@example.com', 'bob']);
    });
  });

  describe('getUserProfile / getGoogleCredentials', () => {
    it('reads recall.user_profiles by user_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: '42', timezone: 'UTC' }] });
      await userRepo.getUserProfile('42');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/FROM recall\.user_profiles WHERE user_id/i),
        ['42']
      );
    });

    it('reads recall.google_credentials by user_id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await userRepo.getGoogleCredentials('42');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/FROM recall\.google_credentials WHERE user_id/i),
        ['42']
      );
    });
  });
});
