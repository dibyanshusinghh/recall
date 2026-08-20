'use strict';

const MEETING_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  RESCHEDULED: 'rescheduled',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

const ARTIFACT_TYPE = Object.freeze({
  RECORDING: 'recording',
  TRANSCRIPT: 'transcript',
  SUMMARY: 'summary',
});

const ARTIFACT_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  READY: 'ready',
  FAILED: 'failed',
});

const PUBSUB_STATUS = Object.freeze({
  RECEIVED: 'received',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  FAILED: 'failed',
});

const GUEST_RESPONSE_STATUS = Object.freeze({
  NEEDS_ACTION: 'needsAction',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  TENTATIVE: 'tentative',
});

const RECURRING_SCOPE = Object.freeze({
  INSTANCE: 'instance',
  SERIES: 'series',
});

module.exports = {
  MEETING_STATUS,
  ARTIFACT_TYPE,
  ARTIFACT_STATUS,
  PUBSUB_STATUS,
  GUEST_RESPONSE_STATUS,
  RECURRING_SCOPE,
};
