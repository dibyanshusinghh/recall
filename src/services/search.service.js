'use strict';
const searchRepo = require('../repositories/search.repository');

async function searchTranscripts({ q, userId, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  return searchRepo.searchTranscripts(q, userId, limit, offset);
}

async function searchSummaries({ q, userId, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  return searchRepo.searchSummaries(q, userId, limit, offset);
}

module.exports = { searchTranscripts, searchSummaries };
