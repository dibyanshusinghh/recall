'use strict';
const Joi = require('joi');

// public.users.id is BIGINT — pg returns it as a numeric string (e.g. "42").
// Accept any non-empty numeric string. Meeting IDs remain UUID.
const userId = Joi.string().pattern(/^\d+$/).required()
  .description('User ID (BIGINT from public.users, returned as a numeric string by pg)');

const ruleSchema = Joi.object({
  dayOfWeek: Joi.number().integer().min(0).max(6).required()
    .description('0 = Sunday … 6 = Saturday'),
  startTime: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required()
    .description('HH:MM or HH:MM:SS in 24-hour local time'),
  endTime: Joi.string().pattern(/^\d{2}:\d{2}(:\d{2})?$/).required(),
});

const getRules = {
  params: Joi.object({
    id: userId,
  }),
};

const putRules = {
  params: Joi.object({
    id: userId,
  }),
  body: Joi.object({
    rules: Joi.array().items(ruleSchema).min(0).required(),
  }),
};

const getSlots = {
  query: Joi.object({
    userId,
    from: Joi.string().isoDate().required(),
    to: Joi.string().isoDate().required(),
    duration: Joi.number().integer().min(15).max(480).required()
      .description('Slot duration in minutes'),
  }),
};

module.exports = { getRules, putRules, getSlots };
