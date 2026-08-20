'use strict';
/**
 * tests/unit/services/availability.service.test.js
 *
 * Tests for the slot-computation algorithm inside
 * src/services/availability.service.js — specifically getAvailableSlots().
 *
 * Strategy: mock all I/O at the module boundary so only the
 * expand-rules → subtract-busy → split-into-slots algorithm is exercised.
 *
 * Reference date: Monday 2024-01-08 (Luxon weekday=1 → rule day_of_week=1).
 */

// ── Package-level mocks (prevent real connections at module load time) ────────
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

// ── Module-level mocks: I/O boundaries for availability.service ───────────────
jest.mock('../../../src/repositories/user.repository', () => ({
  getUserProfile: jest.fn(),
  upsertPublicUser: jest.fn(),
  upsertUserProfile: jest.fn(),
  upsertGoogleCredentials: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
}));

jest.mock('../../../src/repositories/availability.repository', () => ({
  getRulesByUser: jest.fn(),
  replaceRules: jest.fn(),
}));

jest.mock('../../../src/services/auth.service', () => ({
  handleOAuthCallback: jest.fn(),
  getAuthorizedGoogleClient: jest.fn(),
  verifyToken: jest.fn(),
  signAccessToken: jest.fn(),
  signRefreshToken: jest.fn(),
}));

// googleapis mock — must be set up before the service is loaded
const mockFreebusyQuery = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(() => ({
      freebusy: { query: mockFreebusyQuery },
    })),
  },
}));

const userRepo = require('../../../src/repositories/user.repository');
const availRepo = require('../../../src/repositories/availability.repository');
const authService = require('../../../src/services/auth.service');
const { getAvailableSlots } = require('../../../src/services/availability.service');

const MONDAY = '2024-01-08'; // UTC Monday
const FROM = `${MONDAY}T00:00:00.000Z`;
const TO   = `${MONDAY}T23:59:59.999Z`;

const MONDAY_RULE = {
  day_of_week: 1, // Monday
  start_time: '09:00',
  end_time: '17:00',
};

beforeEach(() => {
  jest.clearAllMocks();
  userRepo.getUserProfile.mockResolvedValue({ timezone: 'UTC' });
  authService.getAuthorizedGoogleClient.mockResolvedValue({});
  // Default: no busy intervals
  mockFreebusyQuery.mockResolvedValue({
    data: { calendars: { primary: { busy: [] } } },
  });
});

describe('getAvailableSlots — no rules', () => {
  it('returns an empty array when the user has no availability rules', async () => {
    availRepo.getRulesByUser.mockResolvedValue([]);

    const slots = await getAvailableSlots('42', FROM, TO, 60);
    expect(slots).toEqual([]);
  });
});

describe('getAvailableSlots — basic slot splitting', () => {
  it('returns 8 hourly slots for a 9-to-5 Monday rule with no busy time', async () => {
    availRepo.getRulesByUser.mockResolvedValue([MONDAY_RULE]);

    const slots = await getAvailableSlots('42', FROM, TO, 60);

    expect(slots).toHaveLength(8);
    // First slot starts at 09:00 UTC
    expect(slots[0].startTime).toBe('2024-01-08T09:00:00.000Z');
    expect(slots[0].endTime).toBe('2024-01-08T10:00:00.000Z');
    // Last slot ends at 17:00 UTC
    expect(slots[7].startTime).toBe('2024-01-08T16:00:00.000Z');
    expect(slots[7].endTime).toBe('2024-01-08T17:00:00.000Z');
  });

  it('does not return partial slots when remaining window is shorter than duration', async () => {
    availRepo.getRulesByUser.mockResolvedValue([MONDAY_RULE]);

    // Request 90-minute slots across a 2-hour window → 1 slot, not 1.33
    const slots = await getAvailableSlots(
      '42',
      `${MONDAY}T09:00:00.000Z`,
      `${MONDAY}T11:00:00.000Z`,
      90
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].startTime).toBe('2024-01-08T09:00:00.000Z');
    expect(slots[0].endTime).toBe('2024-01-08T10:30:00.000Z');
  });
});

describe('getAvailableSlots — busy interval subtraction', () => {
  it('removes the busy window from available slots', async () => {
    availRepo.getRulesByUser.mockResolvedValue([MONDAY_RULE]);

    // Busy 10:00–11:00
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          primary: {
            busy: [
              { start: '2024-01-08T10:00:00.000Z', end: '2024-01-08T11:00:00.000Z' },
            ],
          },
        },
      },
    });

    const slots = await getAvailableSlots('42', FROM, TO, 60);

    const times = slots.map((s) => s.startTime);
    // 09:00 slot should exist
    expect(times).toContain('2024-01-08T09:00:00.000Z');
    // 10:00 slot should NOT exist (blocked by busy interval)
    expect(times).not.toContain('2024-01-08T10:00:00.000Z');
    // 11:00 slot should exist (after busy window ends)
    expect(times).toContain('2024-01-08T11:00:00.000Z');
    // Total: 7 slots (was 8, removed 10-11)
    expect(slots).toHaveLength(7);
  });
});

describe('getAvailableSlots — graceful degradation', () => {
  it('returns rule-based slots when freebusy API throws (Tier 1 resilience)', async () => {
    availRepo.getRulesByUser.mockResolvedValue([MONDAY_RULE]);
    mockFreebusyQuery.mockRejectedValue(new Error('Google API timeout'));

    // Should NOT throw — must return unfiltered rule-based slots
    const slots = await getAvailableSlots('42', FROM, TO, 60);
    expect(slots).toHaveLength(8); // all 8 slots, no busy filtering
  });
});

describe('getAvailableSlots — timezone edge case', () => {
  it('correctly expands rules in America/New_York timezone (UTC-5)', async () => {
    // User in New York; working 09:00–10:00 NY time = 14:00–15:00 UTC
    userRepo.getUserProfile.mockResolvedValue({ timezone: 'America/New_York' });
    availRepo.getRulesByUser.mockResolvedValue([
      { day_of_week: 1, start_time: '09:00', end_time: '10:00' },
    ]);

    // Query a wide UTC range that covers the whole NY workday
    const slots = await getAvailableSlots(
      '42',
      `${MONDAY}T00:00:00.000Z`,
      `${MONDAY}T23:59:59.999Z`,
      60
    );

    expect(slots).toHaveLength(1);
    // 09:00 New York (EST/UTC-5) = 14:00 UTC
    expect(slots[0].startTime).toBe('2024-01-08T14:00:00.000Z');
    expect(slots[0].endTime).toBe('2024-01-08T15:00:00.000Z');
  });
});
