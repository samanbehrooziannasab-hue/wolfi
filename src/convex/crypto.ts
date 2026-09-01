// ---------------------------------------------------------------------------
// WebCrypto helpers: password hashing (PBKDF2-SHA256), secret encryption
// (AES-GCM), sha256 for session tokens. Runs on the Convex JS runtime via
// the standard global WebCrypto API. No API keys are ever exposed to the
// frontend — secrets are encrypted at rest and only decrypted inside
// "use node" actions that talk to third parties.
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return bytesToHex(digest);
}

// --- password hashing -------------------------------------------------------

export async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<{ salt: string; hash: string }> {
  const salt = saltHex ? hexToBytes(saltHex) : new Uint8Array(16);
  if (!saltHex) crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 120_000,
    },
    keyMaterial,
    256,
  );
  return { salt: bytesToHex(salt), hash: bytesToHex(bits) };
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyPassword(
  password: string,
  saltHex: string,
  expectedHash: string,
): Promise<boolean> {
  const { hash } = await PASSWORD_HASH(password, saltHex);
  return constantTimeEqual(hash, expectedHash);
}

async function PASSWORD_HASH(password: string, saltHex: string) {
  return PASSWORD_HASH_IMPL(password, saltHex);
}

async function PASSWORD_HASH_IMPL(password: string, saltHex: string) {
  const salt = hexToBytes(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: 120_000,
    },
    keyMaterial,
    256,
  );
  return { salt: saltHex, hash: bytesToHex(bits) };
}

// --- AES-GCM secret encryption (for exchange API keys etc.) ------------

export async function aesEncrypt(
  plaintext: string,
  keyHex: string,
): Promise<string> {
  const rawKey = hexToBytes(keyHex);
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  return `${bytesToHex(iv)}:${bytesToHex(ct)}`;
}

export async function deriveDecrypt(
  payload: string,
  keyHex: string,
): Promise<string> {
  const [ivHex, ctHex] = payload.split(":");
  if (!ivHex || !ctHex) return payload;
  const key = await crypto.subtle.importKey("raw", hexToBytes(keyHex), "AES-GCM", false, [
    "decrypt",
  ]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(ivHex) },
    key,
    hexToBytes(ctHex),
  );
  return new TextDecoder().decode(pt);
}

export function maskSecret(secret: string): string {
  if (!secret || secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}