'use strict';
/**
 * tests/unit/services/slotHold.service.test.js
 *
 * Tests for src/services/slotHold.service.js.
 *
 * Strategy: mock the ioredis client that is created inside src/config/redis.js
 * so that no real Redis connection is made. The mock exposes jest.fn() versions
 * of set / get / del so each test can control return values.
 */

// ── Mock ioredis at the package level ────────────────────────────────────────
// ioredis attempts to connect on construction; the mock prevents that.
const mockRedisInstance = {
  on: jest.fn().mockReturnThis(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
};
jest.mock('ioredis', () => jest.fn().mockImplementation(() => mockRedisInstance));

// ── Also mock bullmq so its Queue constructor doesn't try to connect ─────────
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'mock-job' }),
    close: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

const slotHoldService = require('../../../src/services/slotHold.service');
const AppError = require('../../../src/utils/AppError');

const ORG = '42';
const START = '2024-01-08T09:00:00.000Z';
const END   = '2024-01-08T10:00:00.000Z';

function makeHoldValue(holdId) {
  return JSON.stringify({ holdId, organizerId: ORG, startTime: START, endTime: END });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('slotHold.service — createHold', () => {
  it('returns a hold object when Redis SET NX succeeds (returns "OK")', async () => {
    mockRedisInstance.set.mockResolvedValueOnce('OK');

    const result = await slotHoldService.createHold(ORG, START, END);

    expect(mockRedisInstance.set).toHaveBeenCalledTimes(1);
    const [key, value, nx, ex, ttl] = mockRedisInstance.set.mock.calls[0];
    expect(key).toContain(ORG);
    expect(key).toContain(START);
    expect(nx).toBe('NX');
    expect(ex).toBe('EX');
    expect(ttl).toBeGreaterThan(0);
    expect(result).toMatchObject({ organizerId: ORG, startTime: START, endTime: END });
    expect(typeof result.holdId).toBe('string');
    expect(result.expiresIn).toBe(600); // SLOT_HOLD_TTL_SECONDS from setup.env.js
  });

  it('throws AppError 409 when Redis SET NX returns null (slot already held)', async () => {
    mockRedisInstance.set.mockResolvedValueOnce(null);

    await expect(slotHoldService.createHold(ORG, START, END)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('already held'),
    });
  });
});

describe('slotHold.service — validateHold', () => {
  it('returns hold data when holdId matches', async () => {
    const holdId = 'test-hold-uuid-abc';
    mockRedisInstance.get.mockResolvedValueOnce(makeHoldValue(holdId));

    const result = await slotHoldService.validateHold(holdId, ORG, START, END);
    expect(result.holdId).toBe(holdId);
    expect(result.organizerId).toBe(ORG);
  });

  it('throws AppError 409 when the Redis key does not exist (expired)', async () => {
    mockRedisInstance.get.mockResolvedValueOnce(null);

    await expect(
      slotHoldService.validateHold('any-hold-id', ORG, START, END)
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('expired') });
  });

  it('throws AppError 403 when the holdId does not match what is stored', async () => {
    // Redis has hold for a different holdId (race condition / wrong caller)
    mockRedisInstance.get.mockResolvedValueOnce(makeHoldValue('real-hold-id'));

    await expect(
      slotHoldService.validateHold('wrong-hold-id', ORG, START, END)
    ).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('mismatch') });
  });
});

describe('slotHold.service — releaseHold', () => {
  it('calls redis.del with the correct key', async () => {
    mockRedisInstance.del.mockResolvedValueOnce(1);

    await slotHoldService.releaseHold(ORG, START, END);

    expect(mockRedisInstance.del).toHaveBeenCalledTimes(1);
    const [key] = mockRedisInstance.del.mock.calls[0];
    expect(key).toContain(`slot_hold:${ORG}:${START}:${END}`);
  });
});

describe('slotHold.service — race condition scenario', () => {
  it('two concurrent createHold calls: first wins, second gets 409', async () => {
    // Simulate real Redis NX semantics: first write succeeds, second returns null
    mockRedisInstance.set
      .mockResolvedValueOnce('OK')    // first caller
      .mockResolvedValueOnce(null);   // second caller (slot already taken)

    const first  = slotHoldService.createHold(ORG, START, END);
    const second = slotHoldService.createHold(ORG, START, END);

    const [firstResult, secondResult] = await Promise.allSettled([first, second]);

    expect(firstResult.status).toBe('fulfilled');
    expect(secondResult.status).toBe('rejected');
    expect(secondResult.reason).toBeInstanceOf(AppError);
    expect(secondResult.reason.statusCode).toBe(409);
  });
});
