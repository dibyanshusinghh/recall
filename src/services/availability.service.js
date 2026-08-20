'use strict';
const { google } = require('googleapis');
const { DateTime, Interval, Duration } = require('luxon');
const availRepo = require('../repositories/availability.repository');
const userRepo = require('../repositories/user.repository');
const authService = require('./auth.service');
const db = require('../config/db');
const AppError = require('../utils/AppError');

/**
 * Fetch a user's availability rules and return them.
 */
async function getRules(userId) {
  return availRepo.getRulesByUser(userId);
}

/**
 * Replace all availability rules for a user.
 * @param {string} userId
 * @param {Array<{dayOfWeek: number, startTime: string, endTime: string}>} rules
 */
async function replaceRules(userId, rules) {
  return db.transaction((client) => availRepo.replaceRules(client, userId, rules));
}

/**
 * Compute open slots for a user in the given UTC range.
 *
 * Algorithm:
 *  1. Fetch the user's availability_rules and timezone.
 *  2. Expand each rule over every occurrence within [from, to] in the user's timezone.
 *  3. Query Google Calendar freebusy for [from, to].
 *  4. Subtract all busy intervals from the expanded rule slots.
 *  5. Split remaining free intervals into chunks of `durationMinutes`.
 *
 * All returned slot times are in UTC (ISO 8601).
 *
 * @param {string} userId
 * @param {string} from          - ISO 8601 UTC
 * @param {string} to            - ISO 8601 UTC
 * @param {number} durationMinutes
 */
async function getAvailableSlots(userId, from, to, durationMinutes) {
  const profile = await userRepo.getUserProfile(userId);
  const timezone = profile?.timezone || 'UTC';

  const rules = await availRepo.getRulesByUser(userId);
  if (rules.length === 0) return [];

  const fromDT = DateTime.fromISO(from, { zone: 'utc' });
  const toDT = DateTime.fromISO(to, { zone: 'utc' });
  const duration = Duration.fromObject({ minutes: durationMinutes });

  // ── Step 2: Expand rules into concrete Interval objects ──────────────────
  const candidates = [];
  let cursor = fromDT.setZone(timezone).startOf('day');
  const end = toDT.setZone(timezone).endOf('day');

  while (cursor <= end) {
    const dayOfWeek = cursor.weekday % 7; // Luxon: Mon=1…Sun=7 → convert to 0=Sun…6=Sat
    const luxonToRule = (lDay) => (lDay === 7 ? 0 : lDay); // Sunday fix

    for (const rule of rules) {
      if (rule.day_of_week !== luxonToRule(cursor.weekday)) continue;

      const [sh, sm] = rule.start_time.split(':').map(Number);
      const [eh, em] = rule.end_time.split(':').map(Number);

      const slotStart = cursor.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
      const slotEnd = cursor.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

      // Clip to the requested [from, to] range
      const clippedStart = slotStart < fromDT ? fromDT : slotStart;
      const clippedEnd = slotEnd > toDT ? toDT : slotEnd;

      if (clippedStart < clippedEnd) {
        candidates.push(Interval.fromDateTimes(clippedStart.toUTC(), clippedEnd.toUTC()));
      }
    }

    cursor = cursor.plus({ days: 1 });
  }

  if (candidates.length === 0) return [];

  // ── Step 3: Google Calendar freebusy ────────────────────────────────────
  let busyIntervals = [];
  try {
    const authClient = await authService.getAuthorizedGoogleClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin: fromDT.toISO(),
        timeMax: toDT.toISO(),
        timeZone: 'UTC',
        items: [{ id: 'primary' }],
      },
    });

    busyIntervals = (data.calendars?.primary?.busy || []).map((b) =>
      Interval.fromDateTimes(DateTime.fromISO(b.start), DateTime.fromISO(b.end))
    );
  } catch (err) {
    // If the Calendar API call fails we degrade gracefully: return all
    // rule-based slots without filtering (the booking step will re-check).
    // Log but do not throw — Tier 1 must not break due to API hiccups.
    const log = require('../utils/logger');
    log.warn({ err: err.message, userId }, 'freebusy query failed — returning unfiltered slots');
  }

  // ── Step 4: Subtract busy intervals ──────────────────────────────────────
  let freeIntervals = candidates;
  for (const busy of busyIntervals) {
    freeIntervals = freeIntervals.flatMap((free) => {
      if (!free.overlaps(busy)) return [free];
      return free.difference(busy).filter((i) => i.toDuration('minutes').minutes >= durationMinutes);
    });
  }

  // ── Step 5: Split into fixed-size slots ───────────────────────────────────
  const slots = [];
  for (const free of freeIntervals) {
    let cursor2 = free.start;
    while (cursor2.plus(duration) <= free.end) {
      slots.push({
        startTime: cursor2.toUTC().toISO(),
        endTime: cursor2.plus(duration).toUTC().toISO(),
      });
      cursor2 = cursor2.plus(duration);
    }
  }

  return slots;
}

module.exports = { getRules, replaceRules, getAvailableSlots };
