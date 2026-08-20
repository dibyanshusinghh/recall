'use strict';
/**
 * tests/unit/middleware/authenticate.test.js
 *
 * Tests for src/middleware/authenticate.js.
 *
 * Strategy: sign real JWTs with the test JWT_SECRET set in setup.env.js
 * so that the real jsonwebtoken library is exercised. No mocking needed
 * for the happy path; expired-token behaviour is achieved by signing with
 * a very short expiry and using jest.useFakeTimers to advance the clock.
 */
const jwt = require('jsonwebtoken');
const authenticate = require('../../../src/middleware/authenticate');

const SECRET = process.env.JWT_SECRET;

/** Build a minimal mock Express req / res / next triplet. */
function makeReqResNext(authHeader) {
  const req = { headers: authHeader ? { authorization: authHeader } : {} };
  const res = {};
  const next = jest.fn();
  return { req, res, next };
}

function signAccess(payload, opts = {}) {
  return jwt.sign(payload, SECRET, { algorithm: 'HS256', expiresIn: '1h', ...opts });
}

describe('authenticate middleware', () => {
  describe('happy path', () => {
    it('attaches req.user and calls next() for a valid access token', () => {
      const token = signAccess({ sub: '42', email: 'alice@example.com' });
      const { req, res, next } = makeReqResNext(`Bearer ${token}`);

      authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(next).toHaveBeenCalledWith(/* no args */);
      expect(req.user).toEqual({ id: '42', email: 'alice@example.com' });
    });
  });

  describe('missing / malformed header', () => {
    it('calls next(AppError 401) when Authorization header is absent', () => {
      const { req, res, next } = makeReqResNext(undefined);
      authenticate(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeDefined();
      expect(err.statusCode).toBe(401);
    });

    it('calls next(AppError 401) when header does not start with "Bearer "', () => {
      const { req, res, next } = makeReqResNext('Token abc123');
      authenticate(req, res, next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
    });

    it('calls next(AppError 401) for a completely garbage token string', () => {
      const { req, res, next } = makeReqResNext('Bearer not.a.valid.jwt');
      authenticate(req, res, next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.message).toMatch(/invalid access token/i);
    });
  });

  describe('expired token', () => {
    it('calls next(AppError 401) with an expired-token message', () => {
      // Sign a token that is already expired (nbf in the past, exp in the past)
      const expiredToken = jwt.sign(
        { sub: '42', email: 'alice@example.com' },
        SECRET,
        { algorithm: 'HS256', expiresIn: -1 }
      );
      const { req, res, next } = makeReqResNext(`Bearer ${expiredToken}`);
      authenticate(req, res, next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.message).toMatch(/expired/i);
    });
  });

  describe('refresh token used as access token', () => {
    it('calls next(AppError 401) when the token type is "refresh"', () => {
      const refreshToken = signAccess({
        sub: '42',
        email: 'alice@example.com',
        type: 'refresh',
      });
      const { req, res, next } = makeReqResNext(`Bearer ${refreshToken}`);
      authenticate(req, res, next);

      const err = next.mock.calls[0][0];
      expect(err.statusCode).toBe(401);
      expect(err.message).toMatch(/refresh token/i);
    });
  });
});
