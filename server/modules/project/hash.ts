import { createHash } from 'crypto';

/**
 * Creates a SHA-256 hash from the input text
 * @param text The text to hash
 * @returns SHA-256 hash as a hexadecimal string
 */
export function createSha256Hash(text: string): string {
  return createHash('sha256')
    .update(text)
    .digest('hex');
}

/**
 * Creates a SHA-256 hash from multiple inputs
 * @param inputs Array of strings to hash
 * @returns SHA-256 hash as a hexadecimal string
 */
export function createCombinedHash(inputs: string[]): string {
  const hash = createHash('sha256');
  for (const input of inputs) {
    hash.update(input);
  }
  return hash.digest('hex');
}