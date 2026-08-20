'use strict';

/**
 * Reusable OpenAPI 3.0 component schemas.
 * Consumed by src/docs/swagger.js and referenced via $ref from @openapi
 * annotations in route files.
 */
module.exports = {
  // ── Shared error shape ────────────────────────────────────────────────────
  Error: {
    type: 'object',
    properties: {
      status:  { type: 'string', example: 'error' },
      message: { type: 'string', example: 'Something went wrong.' },
    },
  },

  // ── Tier 2 unavailable response (returned instead of 404 when Workspace off) ─
  Tier2Unavailable: {
    type: 'object',
    properties: {
      status:  { type: 'string', example: 'unavailable' },
      message: { type: 'string', example: 'Workspace features are not enabled.' },
    },
  },

  // ── Auth / user ───────────────────────────────────────────────────────────
  UserProfile: {
    type: 'object',
    properties: {
      id:        { type: 'string', description: 'BIGINT user ID returned as a string by pg', example: '42' },
      email:     { type: 'string', format: 'email' },
      username:  { type: 'string' },
      avatarUrl: { type: 'string', nullable: true },
      timezone:  { type: 'string', example: 'UTC' },
    },
  },

  AuthTokens: {
    type: 'object',
    properties: {
      user:         { $ref: '#/components/schemas/UserProfile' },
      accessToken:  { type: 'string', description: 'Short-lived HS256 JWT (default 1d)' },
      refreshToken: { type: 'string', description: 'Long-lived refresh JWT (default 30d)' },
    },
  },

  // ── Availability ──────────────────────────────────────────────────────────
  AvailabilityRule: {
    type: 'object',
    properties: {
      id:          { type: 'string', format: 'uuid' },
      user_id:     { type: 'string', description: 'BIGINT user ID as string' },
      day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=Sunday … 6=Saturday' },
      start_time:  { type: 'string', example: '09:00', description: 'HH:MM 24-hour local time' },
      end_time:    { type: 'string', example: '17:00' },
      created_at:  { type: 'string', format: 'date-time' },
    },
  },

  Slot: {
    type: 'object',
    properties: {
      startTime: { type: 'string', format: 'date-time', description: 'UTC ISO 8601' },
      endTime:   { type: 'string', format: 'date-time' },
    },
  },

  SlotHold: {
    type: 'object',
    properties: {
      holdId:      { type: 'string', format: 'uuid' },
      organizerId: { type: 'string' },
      startTime:   { type: 'string', format: 'date-time' },
      endTime:     { type: 'string', format: 'date-time' },
      expiresIn:   { type: 'integer', description: 'TTL in seconds', example: 600 },
    },
  },

  // ── Meetings ──────────────────────────────────────────────────────────────
  MeetingGuest: {
    type: 'object',
    properties: {
      id:             { type: 'string', format: 'uuid' },
      email:          { type: 'string', format: 'email' },
      name:           { type: 'string', nullable: true },
      responseStatus: {
        type: 'string',
        enum: ['needsAction', 'accepted', 'declined', 'tentative'],
        default: 'needsAction',
      },
    },
  },

  Meeting: {
    type: 'object',
    properties: {
      id:                 { type: 'string', format: 'uuid' },
      organizer_id:       { type: 'string' },
      google_event_id:    { type: 'string' },
      google_calendar_id: { type: 'string' },
      recurring_event_id: { type: 'string', nullable: true },
      rrule:              { type: 'string', nullable: true, example: 'RRULE:FREQ=WEEKLY;BYDAY=MO' },
      is_recurring:       { type: 'boolean' },
      title:              { type: 'string' },
      description:        { type: 'string', nullable: true },
      start_time:         { type: 'string', format: 'date-time' },
      end_time:           { type: 'string', format: 'date-time' },
      timezone:           { type: 'string', example: 'America/New_York' },
      meet_link:          { type: 'string', nullable: true },
      meet_space_id:      { type: 'string', nullable: true },
      status: {
        type: 'string',
        enum: ['scheduled', 'rescheduled', 'cancelled', 'completed'],
      },
      guests:     { type: 'array', items: { $ref: '#/components/schemas/MeetingGuest' } },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
    },
  },

  // ── Tier 2 artifacts ─────────────────────────────────────────────────────
  Artifact: {
    type: 'object',
    properties: {
      id:                   { type: 'string', format: 'uuid' },
      meeting_id:           { type: 'string', format: 'uuid' },
      conference_record_id: { type: 'string', nullable: true },
      type: {
        type: 'string',
        enum: ['recording', 'transcript', 'summary'],
      },
      drive_file_id: { type: 'string', nullable: true },
      docs_file_id:  { type: 'string', nullable: true },
      status: {
        type: 'string',
        enum: ['pending', 'processing', 'ready', 'failed'],
      },
      fetched_at: { type: 'string', format: 'date-time', nullable: true },
      created_at: { type: 'string', format: 'date-time' },
    },
  },

  Transcript: {
    type: 'object',
    properties: {
      id:         { type: 'string', format: 'uuid' },
      meeting_id: { type: 'string', format: 'uuid' },
      content:    { type: 'string' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },

  Summary: {
    type: 'object',
    properties: {
      id:         { type: 'string', format: 'uuid' },
      meeting_id: { type: 'string', format: 'uuid' },
      content:    { type: 'string' },
      source:     { type: 'string', example: 'gemini_native' },
      created_at: { type: 'string', format: 'date-time' },
    },
  },

  // ── Search results ────────────────────────────────────────────────────────
  TranscriptSearchResult: {
    type: 'object',
    properties: {
      id:            { type: 'string', format: 'uuid' },
      meeting_id:    { type: 'string', format: 'uuid' },
      meeting_title: { type: 'string' },
      start_time:    { type: 'string', format: 'date-time' },
      content:       { type: 'string' },
      rank:          { type: 'number', description: 'ts_rank score' },
      created_at:    { type: 'string', format: 'date-time' },
    },
  },

  SummarySearchResult: {
    type: 'object',
    properties: {
      id:            { type: 'string', format: 'uuid' },
      meeting_id:    { type: 'string', format: 'uuid' },
      meeting_title: { type: 'string' },
      start_time:    { type: 'string', format: 'date-time' },
      content:       { type: 'string' },
      source:        { type: 'string' },
      rank:          { type: 'number' },
      created_at:    { type: 'string', format: 'date-time' },
    },
  },
};
