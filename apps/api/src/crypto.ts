import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export const createOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

export const constantTimeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const encryptionKey = (base64Key: string): Buffer => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32)
    throw new Error('FIELD_ENCRYPTION_KEY must be exactly 32 base64-encoded bytes');
  return key;
};

export const encryptField = (plaintext: string, base64Key: string): string => {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(base64Key), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [nonce, tag, ciphertext].map((part) => part.toString('base64url')).join('.');
};

export const decryptField = (payload: string, base64Key: string): string => {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Encrypted payload is malformed');
  const [noncePart, tagPart, ciphertextPart] = parts;
  if (noncePart === undefined || tagPart === undefined || ciphertextPart === undefined) {
    throw new Error('Encrypted payload is malformed');
  }
  const nonce = Buffer.from(noncePart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  const ciphertext = Buffer.from(ciphertextPart, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(base64Key), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

export const signExport = (payload: Buffer, secret: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');
