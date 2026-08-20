'use strict';
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;   // 128-bit IV
const TAG_BYTES = 16;  // 128-bit auth tag (GCM default)

function getKey() {
  const keyHex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt a UTF-8 plaintext string with AES-256-GCM.
 * Returns a colon-delimited string: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 * stored in the database.
 *
 * @param {string} plaintext
 * @returns {string}
 */
function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypt a value produced by encrypt().
 * @param {string} encryptedValue  "<iv>:<authTag>:<ciphertext>" (all hex)
 * @returns {string} Decrypted UTF-8 string
 */
function decrypt(encryptedValue) {
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted value format — expected "iv:authTag:ciphertext"');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const ciphertext = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
