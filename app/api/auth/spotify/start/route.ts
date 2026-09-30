import { NextResponse } from "next/server";
import { createSpotifyPkcePair, buildSpotifyAuthorizeUrl } from "@/lib/spotify";
import { randomUrlSafeToken } from "@/lib/crypto";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "obisan.spotify.state";
const OAUTH_VERIFIER_COOKIE = "obisan.spotify.verifier";
const SECURE_COOKIE = new URL(env.APP_URL).protocol === "https:";

export async function GET() {
  const { codeVerifier, codeChallenge } = createSpotifyPkcePair();
  const state = randomUrlSafeToken(24);
  const authorizeUrl = buildSpotifyAuthorizeUrl({ state, codeChallenge });

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: 60 * 10,
  });
  response.cookies.set(OAUTH_VERIFIER_COOKIE, codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
