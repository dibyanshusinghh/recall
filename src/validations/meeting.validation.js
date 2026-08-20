'use strict';
const Joi = require('joi');

const isoDateTime = Joi.string().isoDate();
const rrulePattern = /^RRULE:/i;

const guestSchema = Joi.object({
  email: Joi.string().email().required(),
  name: Joi.string().max(255).optional(),
});

const create = {
  body: Joi.object({
    title: Joi.string().max(500).required(),
    description: Joi.string().max(5000).optional(),
    startTime: isoDateTime.required(),
    endTime: isoDateTime.required(),
    timezone: Joi.string().max(64).default('UTC'),
    guests: Joi.array().items(guestSchema).default([]),
    holdId: Joi.string().optional(),
    // Recurring meetings (Step 17)
    rrule: Joi.string().pattern(rrulePattern).optional()
      .description('RFC 5545 RRULE string, e.g. "RRULE:FREQ=WEEKLY;BYDAY=MO,WE"'),
  }),
};

const reschedule = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object({
    startTime: isoDateTime.required(),
    endTime: isoDateTime.required(),
    timezone: Joi.string().max(64).optional(),
    // 'instance' updates only this occurrence; 'series' updates all future instances
    scope: Joi.string().valid('instance', 'series').default('instance'),
    reason: Joi.string().max(500).optional(),
  }),
};

const cancel = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object({
    scope: Joi.string().valid('instance', 'series').default('instance'),
    reason: Joi.string().max(500).optional(),
  }),
};

const getOne = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
};

const list = {
  query: Joi.object({
    status: Joi.string().valid('scheduled', 'rescheduled', 'cancelled', 'completed').optional(),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    organizerId: Joi.string().pattern(/^\d+$/).optional()
      .description('Filter by organizer user ID (BIGINT as string)'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

module.exports = { create, reschedule, cancel, getOne, list };
