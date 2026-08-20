'use strict';
const availService = require('../services/availability.service');
const asyncHandler = require('../utils/asyncHandler');

const getRules = asyncHandler(async (req, res) => {
  const rules = await availService.getRules(req.params.id);
  res.status(200).json({ status: 'success', data: rules });
});

const replaceRules = asyncHandler(async (req, res) => {
  const rules = await availService.replaceRules(req.params.id, req.body.rules);
  res.status(200).json({ status: 'success', data: rules });
});

const getSlots = asyncHandler(async (req, res) => {
  const { userId, from, to, duration } = req.query;
  const slots = await availService.getAvailableSlots(userId, from, to, Number(duration));
  res.status(200).json({ status: 'success', data: slots });
});

module.exports = { getRules, replaceRules, getSlots };
