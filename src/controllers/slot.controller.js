'use strict';
const slotHoldService = require('../services/slotHold.service');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

const createHold = asyncHandler(async (req, res) => {
  const { userId, startTime, endTime } = req.body;

  // Enforce that only the authenticated user can hold their own slots
  if (userId !== req.user.id) {
    throw new AppError('You can only hold slots for your own account.', 403);
  }

  const hold = await slotHoldService.createHold(req.user.id, startTime, endTime);
  res.status(201).json({ status: 'success', data: hold });
});

const releaseHold = asyncHandler(async (req, res) => {
  const { holdId } = req.params;
  const { startTime, endTime } = req.body;

  await slotHoldService.releaseHoldById(holdId, req.user.id, startTime, endTime);
  res.status(200).json({ status: 'success', message: 'Hold released.' });
});

module.exports = { createHold, releaseHold };
