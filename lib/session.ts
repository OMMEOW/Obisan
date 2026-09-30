import { cookies } from "next/headers";
import { signSession, verifySession } from "@/lib/crypto";

export type AppSession = {
  userId: string;
  spotifyAccountId: string;
  exp: number;
};

const SESSION_COOKIE = "obisan.session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function createSessionToken(userId: string, spotifyAccountId: string) {
  return signSession({
    userId,
    spotifyAccountId,
    exp: Date.now() + SESSION_TTL_MS,
  } satisfies AppSession);
}

export async function readSession() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  return raw ? verifySession<AppSession>(raw) : null;
}

export function sessionCookieName() {
  return SESSION_COOKIE;
}

export function sessionCookieMaxAgeSeconds() {
  return Math.floor(SESSION_TTL_MS / 1000);
}
