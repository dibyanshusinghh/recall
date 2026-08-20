'use strict';
const meetingService = require('../services/meeting.service');
const artifactRepo = require('../repositories/artifact.repository');
const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');

const createMeeting = asyncHandler(async (req, res) => {
  const meeting = await meetingService.createMeeting(req.user.id, req.body);
  res.status(201).json({ status: 'success', data: meeting });
});

const rescheduleMeeting = asyncHandler(async (req, res) => {
  const meeting = await meetingService.rescheduleMeeting(
    req.params.id,
    req.user.id,
    req.body
  );
  res.status(200).json({ status: 'success', data: meeting });
});

const cancelMeeting = asyncHandler(async (req, res) => {
  const meeting = await meetingService.cancelMeeting(req.params.id, req.user.id, req.body);
  res.status(200).json({ status: 'success', data: meeting });
});

const getMeeting = asyncHandler(async (req, res) => {
  const meeting = await meetingService.getMeeting(req.params.id, req.user.id);
  res.status(200).json({ status: 'success', data: meeting });
});

const listMeetings = asyncHandler(async (req, res) => {
  const meetings = await meetingService.listMeetings(req.query);
  res.status(200).json({ status: 'success', data: meetings });
});

// ─── Tier 2 artifact endpoints ────────────────────────────────────────────────

const TIER2_UNAVAILABLE = {
  status: 'unavailable',
  message: 'Workspace features are not enabled. Enable WORKSPACE_FEATURES_ENABLED=true to access artifacts.',
};

const getArtifacts = asyncHandler(async (req, res) => {
  if (!env.WORKSPACE_FEATURES_ENABLED) {
    return res.status(200).json(TIER2_UNAVAILABLE);
  }

  // Ensure the caller owns (or is a guest of) the meeting
  await meetingService.getMeeting(req.params.id, req.user.id);

  const artifacts = await artifactRepo.getArtifactsByMeeting(req.params.id);
  res.status(200).json({ status: 'success', data: artifacts });
});

const getTranscript = asyncHandler(async (req, res) => {
  if (!env.WORKSPACE_FEATURES_ENABLED) {
    return res.status(200).json(TIER2_UNAVAILABLE);
  }

  await meetingService.getMeeting(req.params.id, req.user.id);
  const transcript = await artifactRepo.getTranscriptByMeeting(req.params.id);

  if (!transcript) {
    return res.status(200).json({
      status: 'pending',
      message: 'Transcript has not been processed yet. Check back after the meeting ends.',
    });
  }

  res.status(200).json({ status: 'success', data: transcript });
});

const getSummary = asyncHandler(async (req, res) => {
  if (!env.WORKSPACE_FEATURES_ENABLED) {
    return res.status(200).json(TIER2_UNAVAILABLE);
  }

  await meetingService.getMeeting(req.params.id, req.user.id);
  const summary = await artifactRepo.getSummaryByMeeting(req.params.id);

  if (!summary) {
    return res.status(200).json({
      status: 'pending',
      message: 'Summary has not been generated yet. Check back after the meeting ends.',
    });
  }

  res.status(200).json({ status: 'success', data: summary });
});

module.exports = {
  createMeeting,
  rescheduleMeeting,
  cancelMeeting,
  getMeeting,
  listMeetings,
  getArtifacts,
  getTranscript,
  getSummary,
};
