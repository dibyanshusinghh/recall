'use strict';
/**
 * tests/unit/utils/encryption.test.js
 *
 * Pure unit tests for src/utils/encryption.js.
 * No mocking required — the module is a pure function over Node's crypto API.
 */
const { encrypt, decrypt } = require('../../../src/utils/encryption');

describe('encryption utils', () => {
  describe('encrypt / decrypt roundtrip', () => {
    it('decrypts a ciphertext back to the original plaintext', () => {
      const original = 'my-google-refresh-token-abc123';
      const ciphertext = encrypt(original);
      expect(decrypt(ciphertext)).toBe(original);
    });

    it('produces a different ciphertext on each call (random IV)', () => {
      const plaintext = 'same-input';
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      expect(a).not.toBe(b);
      // Both must still decrypt correctly
      expect(decrypt(a)).toBe(plaintext);
      expect(decrypt(b)).toBe(plaintext);
    });

    it('produces output in the iv:authTag:ciphertext format', () => {
      const result = encrypt('hello');
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
      // IV = 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32);
      // Auth tag = 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
    });
  });

  describe('decrypt — error cases', () => {
    it('throws on malformed input (wrong number of colons)', () => {
      expect(() => decrypt('no-colons-here')).toThrow(
        /Invalid encrypted value format/
      );
    });

    it('throws when auth tag is tampered (GCM integrity check)', () => {
      const ciphertext = encrypt('secret');
      const parts = ciphertext.split(':');
      // Flip one byte in the auth tag
      const badTag = parts[1].slice(0, -2) + 'ff';
      const tampered = [parts[0], badTag, parts[2]].join(':');
      expect(() => decrypt(tampered)).toThrow();
    });
  });
});
