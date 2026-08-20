'use strict';
/**
 * tests/integration/meeting.lifecycle.test.js
 *
 * Tests for:
 *  - Reschedule / cancel status transitions and meeting_status_history writes (priority 6)
 *  - Recurring meeting instance-vs-series Google event targeting (priority 7)
 */

// ── Package mocks ─────────────────────────────────────────────────────────────
jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({
  on: jest.fn().mockReturnThis(),
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
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

// ── Module mocks ──────────────────────────────────────────────────────────────
const mockCalendarEventsPatch  = jest.fn();
const mockCalendarEventsDelete = jest.fn();
const mockCalendarEventsInsert = jest.fn();

jest.mock('googleapis', () => ({
  google: {
    calendar: jest.fn(() => ({
      events: {
        insert: mockCalendarEventsInsert,
        patch:  mockCalendarEventsPatch,
        delete: mockCalendarEventsDelete,
      },
    })),
  },
}));

jest.mock('../../src/services/auth.service', () => ({
  getAuthorizedGoogleClient: jest.fn().mockResolvedValue({}),
  verifyToken: jest.fn(),
}));

const mockClient = { query: jest.fn() };
jest.mock('../../src/config/db', () => ({
  query: jest.fn().mockResolvedValue({ rows: [] }),
  transaction: jest.fn((fn) => fn(mockClient)),
  getClient: jest.fn().mockResolvedValue(mockClient),
  connectDb: jest.fn(),
}));

const mockMeetingRepo = {
  findById: jest.fn(),
  updateMeeting: jest.fn(),
  insertStatusHistory: jest.fn().mockResolvedValue(undefined),
  createGuests: jest.fn(),
  create: jest.fn(),
  list: jest.fn().mockResolvedValue([]),
  findByGoogleEventId: jest.fn().mockResolvedValue(null),
};
jest.mock('../../src/repositories/meeting.repository', () => mockMeetingRepo);

const { rescheduleMeeting, cancelMeeting } = require('../../src/services/meeting.service');

// ── Shared test fixtures ──────────────────────────────────────────────────────
const ORGANIZER_ID = '42';
const MEETING_ID   = 'meeting-uuid-001';
const GOOGLE_EVT   = 'google-evt-001';

function makeMeeting(overrides = {}) {
  return {
    id:                 MEETING_ID,
    organizer_id:       ORGANIZER_ID,
    google_event_id:    GOOGLE_EVT,
    recurring_event_id: null,
    status:             'scheduled',
    timezone:           'UTC',
    is_recurring:       false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalendarEventsPatch.mockResolvedValue({ data: {} });
  mockCalendarEventsDelete.mockResolvedValue({ data: {} });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reschedule
// ─────────────────────────────────────────────────────────────────────────────

describe('rescheduleMeeting — status transitions', () => {
  const RESCHEDULE_DATA = {
    startTime: '2024-01-09T10:00:00.000Z',
    endTime:   '2024-01-09T11:00:00.000Z',
    timezone:  'UTC',
    reason:    'Moved by organizer',
  };

  it('updates DB status to "rescheduled" and inserts history', async () => {
    mockMeetingRepo.findById.mockResolvedValue(makeMeeting());
    mockMeetingRepo.updateMeeting.mockResolvedValue({ ...makeMeeting(), status: 'rescheduled' });

    await rescheduleMeeting(MEETING_ID, ORGANIZER_ID, RESCHEDULE_DATA);

    expect(mockMeetingRepo.updateMeeting).toHaveBeenCalledWith(
      mockClient,
      MEETING_ID,
      expect.objectContaining({ status: 'rescheduled' })
    );
    expect(mockMeetingRepo.insertStatusHistory).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        meetingId:  MEETING_ID,
        fromStatus: 'scheduled',
        toStatus:   'rescheduled',
        reason:     RESCHEDULE_DATA.reason,
      })
    );
  });

  it('calls Google events.patch before writing to the DB', async () => {
    const order = [];
    mockMeetingRepo.findById.mockResolvedValue(makeMeeting());
    mockCalendarEventsPatch.mockImplementationOnce(async () => { order.push('google'); return {}; });
    mockMeetingRepo.updateMeeting.mockImplementationOnce(async () => { order.push('db'); return {}; });

    await rescheduleMeeting(MEETING_ID, ORGANIZER_ID, RESCHEDULE_DATA);

    expect(order).toEqual(['google', 'db']);
  });

  it('throws 400 when trying to reschedule a cancelled meeting', async () => {
    mockMeetingRepo.findById.mockResolvedValue(makeMeeting({ status: 'cancelled' }));

    await expect(
      rescheduleMeeting(MEETING_ID, ORGANIZER_ID, RESCHEDULE_DATA)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('cancelled') });
  });

  it('throws 404 when meeting does not exist', async () => {
    mockMeetingRepo.findById.mockResolvedValue(null);

    await expect(
      rescheduleMeeting('no-such-id', ORGANIZER_ID, RESCHEDULE_DATA)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cancel
// ─────────────────────────────────────────────────────────────────────────────

describe('cancelMeeting — status transitions', () => {
  it('updates DB status to "cancelled" and inserts history', async () => {
    mockMeetingRepo.findById.mockResolvedValue(makeMeeting());
    mockMeetingRepo.updateMeeting.mockResolvedValue({ ...makeMeeting(), status: 'cancelled' });

    await cancelMeeting(MEETING_ID, ORGANIZER_ID, { reason: 'No longer needed' });

    expect(mockMeetingRepo.updateMeeting).toHaveBeenCalledWith(
      mockClient,
      MEETING_ID,
      expect.objectContaining({ status: 'cancelled' })
    );
    expect(mockMeetingRepo.insertStatusHistory).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({ fromStatus: 'scheduled', toStatus: 'cancelled' })
    );
  });

  it('throws 400 when meeting is already cancelled', async () => {
    mockMeetingRepo.findById.mockResolvedValue(makeMeeting({ status: 'cancelled' }));

    await expect(
      cancelMeeting(MEETING_ID, ORGANIZER_ID)
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('already cancelled') });
  });

  it('proceeds (does not throw) when Google returns 410 Gone', async () => {
    mockMeetingRepo.findById.mockResolvedValue(makeMeeting());
    mockMeetingRepo.updateMeeting.mockResolvedValue({ ...makeMeeting(), status: 'cancelled' });
    // 410 = already deleted on Google's side; the service should treat as success
    const gone = Object.assign(new Error('Gone'), { status: 410 });
    mockCalendarEventsDelete.mockRejectedValueOnce(gone);

    await expect(
      cancelMeeting(MEETING_ID, ORGANIZER_ID)
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recurring meeting instance-vs-series handling
// ─────────────────────────────────────────────────────────────────────────────

describe('recurring meeting — instance vs series scope', () => {
  const MASTER_EVENT_ID = 'google-master-evt';
  const INSTANCE_EVT_ID = 'google-instance-evt-001';

  const recurringMeeting = makeMeeting({
    is_recurring:       true,
    google_event_id:    INSTANCE_EVT_ID,
    recurring_event_id: MASTER_EVENT_ID,
  });

  const RESCHED = {
    startTime: '2024-01-10T10:00:00.000Z',
    endTime:   '2024-01-10T11:00:00.000Z',
  };

  beforeEach(() => {
    mockMeetingRepo.findById.mockResolvedValue(recurringMeeting);
    mockMeetingRepo.updateMeeting.mockResolvedValue({ ...recurringMeeting, status: 'rescheduled' });
  });

  it('targets the master event ID (recurring_event_id) when scope="series"', async () => {
    await rescheduleMeeting(MEETING_ID, ORGANIZER_ID, { ...RESCHED, scope: 'series' });

    const patchCall = mockCalendarEventsPatch.mock.calls[0][0];
    expect(patchCall.eventId).toBe(MASTER_EVENT_ID);
  });

  it('targets the instance event ID (google_event_id) when scope="instance"', async () => {
    await rescheduleMeeting(MEETING_ID, ORGANIZER_ID, { ...RESCHED, scope: 'instance' });

    const patchCall = mockCalendarEventsPatch.mock.calls[0][0];
    expect(patchCall.eventId).toBe(INSTANCE_EVT_ID);
  });

  it('targets the instance event ID when scope is omitted (defaults to "instance")', async () => {
    await rescheduleMeeting(MEETING_ID, ORGANIZER_ID, RESCHED);

    const patchCall = mockCalendarEventsPatch.mock.calls[0][0];
    expect(patchCall.eventId).toBe(INSTANCE_EVT_ID);
  });

  it('cancel with scope="series" targets the master event ID', async () => {
    mockMeetingRepo.updateMeeting.mockResolvedValue({ ...recurringMeeting, status: 'cancelled' });

    await cancelMeeting(MEETING_ID, ORGANIZER_ID, { scope: 'series' });

    const deleteCall = mockCalendarEventsDelete.mock.calls[0][0];
    expect(deleteCall.eventId).toBe(MASTER_EVENT_ID);
  });
});
