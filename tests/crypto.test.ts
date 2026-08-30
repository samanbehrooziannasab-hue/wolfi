// ─── Backend unit tests (bun test) ─────────────────────────────────────────
// Covers the WebCrypto helpers (src/convex/crypto.ts) used for password
// hashing (PBKDF2-SHA256), secret encryption (AES-GCM), session tokens and
// masked secret display. Bun provides the standard global WebCrypto API.
import { describe, expect, test } from "bun:test";
import {
  aesEncrypt,
  bytesToHex,
  deriveDecrypt,
  hashPassword,
  hexToBytes,
  maskSecret,
  randomToken,
  sha256Hex,
  verifyPassword,
} from "../src/convex/crypto";

describe("hex helpers", () => {
  test("bytesToHex / hexToBytes roundtrip", () => {
    const bytes = new Uint8Array([0, 1, 15, 16, 255, 128]);
    const hex = bytesToHex(bytes);
    expect(hex).toBe("00010f10ff80");
    expect(hexToBytes(hex)).toEqual(bytes);
  });

  test("bytesToHex accepts ArrayBuffer", () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    expect(bytesToHex(buf)).toBe("010203");
  });
});

describe("randomToken", () => {
  test("produces 64 hex chars (32 bytes) and is unique", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("sha256Hex", () => {
  test("matches the well-known SHA-256 vector for 'abc'", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("is deterministic", async () => {
    expect(await sha256Hex("wolf-secret")).toBe(await sha256Hex("wolf-secret"));
  });
});

describe("password hashing", () => {
  test("hashPassword / verifyPassword roundtrip", async () => {
    const { salt, hash } = await hashPassword("Wolf3010!");
    expect(salt).toMatch(/^[0-9a-f]{32}$/); // 16-byte salt
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // 256-bit hash
    expect(await verifyPassword("Wolf3010!", salt, hash)).toBe(true);
    expect(await verifyPassword("wrong-password", salt, hash)).toBe(false);
  });

  test("same password with same salt → identical hash (deterministic)", async () => {
    const { salt, hash } = await hashPassword("secret", "00112233445566778899aabbccddeeff");
    const again = await hashPassword("secret", "00112233445566778899aabbccddeeff");
    expect(hash).toBe(again.hash);
    expect(salt).toBe("00112233445566778899aabbccddeeff");
  });

  test("different salts produce different hashes for the same password", async () => {
    const a = await hashPassword("secret");
    const b = await hashPassword("secret");
    expect(a.hash).not.toBe(b.hash);
    expect(a.salt).not.toBe(b.salt);
  });
});

describe("AES-GCM encryption", () => {
  test("aesEncrypt / deriveDecrypt roundtrip", async () => {
    const key = randomToken(32); // 64 hex chars = 32 bytes
    const secret = "telegram-bot-token-123456:secret";
    const enc = await aesEncrypt(secret, key);
    expect(enc).toContain(":"); // iv:ciphertext
    expect(await deriveDecrypt(enc, key)).toBe(secret);
  });

  test("ciphertext differs each time (random IV)", async () => {
    const key = randomToken(32);
    const a = await aesEncrypt("same-plaintext", key);
    const b = await aesEncrypt("same-plaintext", key);
    expect(a).not.toBe(b);
  });

  test("wrong key fails to decrypt (returns input untouched on malformed payload)", async () => {
    const key = randomToken(32);
    const enc = await aesEncrypt("hello", key);
    await expect(deriveDecrypt(enc, randomToken(32))).rejects.toThrow();
  });

  test("payload without the iv:cipher separator returns as-is", async () => {
    expect(await deriveDecrypt("no-colon", randomToken(32))).toBe("no-colon");
  });
});

describe("maskSecret", () => {
  test("short secrets are fully masked", () => {
    expect(maskSecret("ab")).toBe("********");
    expect(maskSecret("")).toBe("********");
  });

  test("long secrets keep first 4 and last 4 chars", () => {
    expect(maskSecret("AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ1234")).toBe("AIza…1234");
  });
});
