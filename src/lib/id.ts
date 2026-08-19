import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** ID ngắn, an toàn, không cần thư viện ngoài. */
export function createId(size = 20): string {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
