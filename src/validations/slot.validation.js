'use strict';
const Joi = require('joi');

// recall.users.id is BIGINT — pg returns it as a numeric string (e.g. "42").
const userId = Joi.string().pattern(/^\d+$/).required();

const createHold = {
  body: Joi.object({
    userId,
    startTime: Joi.string().isoDate().required(),
    endTime: Joi.string().isoDate().required(),
  }),
};

const releaseHold = {
  params: Joi.object({
    holdId: Joi.string().required(),
  }),
};

module.exports = { createHold, releaseHold };
