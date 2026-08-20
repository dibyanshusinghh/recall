'use strict';
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  // Set env vars BEFORE any module is loaded (dotenv must not override these)
  setupFiles: ['<rootDir>/tests/setup.env.js'],
  collectCoverageFrom: [
    'src/services/**/*.js',
    'src/middleware/**/*.js',
    'src/utils/**/*.js',
    'src/controllers/**/*.js',
    '!src/**/*.test.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  // Keep test output clean — individual test files print their own output
  verbose: true,
};
