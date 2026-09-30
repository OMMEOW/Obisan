import crypto from "node:crypto";
import { env } from "@/lib/env";

const tokenKey = crypto.createHash("sha256").update(env.TOKEN_ENCRYPTION_KEY).digest();

export function randomUrlSafeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function sha256Base64Url(value: string) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(
    "."
  );
}

export function decryptSecret(payload: string) {
  const [iv, encrypted, tag] = payload.split(".");
  if (!iv || !encrypted || !tag) throw new Error("Malformed encrypted payload");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    tokenKey,
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

export function signSession(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.SESSION_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

export function verifySession<T extends object>(value: string) {
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", env.SESSION_SECRET).update(body).digest("base64url");
  if (signature.length !== expected.length) return null;
  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  if (!valid) return null;

  let parsed: T & { exp?: number };
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
  } catch {
    return null;
  }
  if (parsed.exp && Date.now() > parsed.exp) return null;
  return parsed;
}
