import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { exchangeSpotifyCode, fetchSpotifyProfile } from "@/lib/spotify";
import { encryptSecret } from "@/lib/crypto";
import { createSessionToken, sessionCookieMaxAgeSeconds, sessionCookieName } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { enqueueSpotifySyncJob } from "@/lib/jobs/spotify";

export const runtime = "nodejs";

const OAUTH_STATE_COOKIE = "obisan.spotify.state";
const OAUTH_VERIFIER_COOKIE = "obisan.spotify.verifier";
const SECURE_COOKIE = new URL(env.APP_URL).protocol === "https:";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, env.APP_URL));
  }

  if (!code || !state) {
    return NextResponse.json({ error: "Missing OAuth code or state" }, { status: 400 });
  }

  const stateCookie = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(OAUTH_VERIFIER_COOKIE)?.value;

  if (!stateCookie || !verifier || stateCookie !== state) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  const token = await exchangeSpotifyCode({ code, codeVerifier: verifier });
  const profile = await fetchSpotifyProfile(token.access_token);

  const expiresAt = new Date(Date.now() + token.expires_in * 1000);
  if (!token.refresh_token) {
    return NextResponse.json({ error: "Spotify did not return a refresh token" }, { status: 502 });
  }

  const accessTokenCiphertext = encryptSecret(token.access_token);
  const refreshTokenCiphertext = encryptSecret(token.refresh_token);

  const existingAccount = await prisma.spotifyAccount.findUnique({ where: { spotifyUserId: profile.id } });

  let user: { id: string } | null = null;
  if (existingAccount) {
    user = await prisma.user.findUnique({ where: { id: existingAccount.userId } });
  }

  if (!user && profile.email) {
    user = await prisma.user.upsert({
      where: { email: profile.email },
      create: {
        email: profile.email,
        displayName: profile.display_name,
        avatarUrl: profile.images[0]?.url ?? null,
      },
      update: {
        displayName: profile.display_name,
        avatarUrl: profile.images[0]?.url ?? null,
      },
    });
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: `${profile.id}@spotify.local`,
        displayName: profile.display_name,
        avatarUrl: profile.images[0]?.url ?? null,
      },
    });
  }

  const spotifyAccount = await prisma.spotifyAccount.upsert({
    where: { spotifyUserId: profile.id },
    create: {
      userId: user.id,
      spotifyUserId: profile.id,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      tokenExpiresAt: expiresAt,
      tokenType: token.token_type,
      scopes: token.scope,
      spotifyDisplayName: profile.display_name,
      spotifyEmail: profile.email ?? null,
      spotifyCountry: profile.country ?? null,
      spotifyProduct: profile.product ?? null,
      spotifyImageUrl: profile.images[0]?.url ?? null,
      spotifyFollowers: profile.followers.total,
      syncStatus: "PENDING",
      needsInitialSync: true,
    },
    update: {
      userId: user.id,
      accessTokenCiphertext,
      refreshTokenCiphertext,
      tokenExpiresAt: expiresAt,
      tokenType: token.token_type,
      scopes: token.scope,
      spotifyDisplayName: profile.display_name,
      spotifyEmail: profile.email ?? null,
      spotifyCountry: profile.country ?? null,
      spotifyProduct: profile.product ?? null,
      spotifyImageUrl: profile.images[0]?.url ?? null,
      spotifyFollowers: profile.followers.total,
      syncStatus: "PENDING",
      needsInitialSync: true,
    },
  });

  await enqueueSpotifySyncJob({
    userId: user.id,
    spotifyAccountId: spotifyAccount.id,
    kind: "INITIAL_SYNC",
  });

  const sessionToken = createSessionToken(user.id, spotifyAccount.id);
  const response = NextResponse.redirect(new URL("/dashboard", env.APP_URL));
  response.cookies.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: SECURE_COOKIE,
    path: "/",
    maxAge: sessionCookieMaxAgeSeconds(),
  });
  response.cookies.set(OAUTH_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  response.cookies.set(OAUTH_VERIFIER_COOKIE, "", { path: "/", maxAge: 0 });

  return response;
}
