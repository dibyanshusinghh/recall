'use strict';
const Joi = require('joi');

const googleCallback = {
  query: Joi.object({
    code: Joi.string().required(),
    state: Joi.string().optional(),
    error: Joi.string().optional(),
  }),
};

const refresh = {
  body: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

module.exports = { googleCallback, refresh };
