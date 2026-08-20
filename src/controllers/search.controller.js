'use strict';
const searchService = require('../services/search.service');
const asyncHandler = require('../utils/asyncHandler');
const Joi = require('joi');
const AppError = require('../utils/AppError');

const searchSchema = Joi.object({
  q: Joi.string().min(2).max(500).required(),
  userId: Joi.string().uuid().required(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(50).default(20),
});

const searchTranscripts = asyncHandler(async (req, res) => {
  const { error, value } = searchSchema.validate(req.query, { convert: true });
  if (error) throw new AppError(error.details[0].message, 400);

  const results = await searchService.searchTranscripts(value);
  res.status(200).json({ status: 'success', data: results });
});

const searchSummaries = asyncHandler(async (req, res) => {
  const { error, value } = searchSchema.validate(req.query, { convert: true });
  if (error) throw new AppError(error.details[0].message, 400);

  const results = await searchService.searchSummaries(value);
  res.status(200).json({ status: 'success', data: results });
});

module.exports = { searchTranscripts, searchSummaries };
