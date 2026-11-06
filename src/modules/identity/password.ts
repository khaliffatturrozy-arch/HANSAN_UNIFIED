import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

function scrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

const PARAMS = { N: 16_384, r: 8, p: 1, keyLength: 64 } as const;

function encode(value: Buffer): string {
  return value.toString("base64url");
}

/**
 * scrypt password hashing with a per-password salt. The encoded format keeps
 * parameters with the hash so cost can be raised without invalidating users.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10 || password.length > 256) {
    throw new Error("Password must be between 10 and 256 characters");
  }
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${encode(salt)}$${encode(derived)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4] ?? "", "base64url");
  const expected = Buffer.from(parts[5] ?? "", "base64url");
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || expected.length === 0) {
    return false;
  }
  try {
    const actual = (await scrypt(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    })) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * A stable hash used to keep missing-user login responses timing-similar.
 * It is not a credential for any account.
 */
export const DUMMY_PASSWORD_HASH =
  "scrypt$16384$8$1$YWJvdXQtdGhlLXRpbWluZw$" +
  "Z9F6d0nV7A0m8m6w0x8c2m2g5l1m0g0J6u7u3n8o2p4q5r6s7t8u9v0w1x2y3z4a5b6c7d8e9f0g1h2i3j4k5l6m7n8o";
