import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { refreshSpotifyToken } from "@/lib/spotify";

export const runtime = "nodejs";

export async function POST(_request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.spotifyAccount.findUnique({ where: { id: session.spotifyAccountId } });
  if (!account) return NextResponse.json({ error: "Spotify account not found" }, { status: 404 });

  const currentRefreshToken = decryptSecret(account.refreshTokenCiphertext);
  const refreshed = await refreshSpotifyToken(currentRefreshToken);

  const updated = await prisma.spotifyAccount.update({
    where: { id: account.id },
    data: {
      accessTokenCiphertext: encryptSecret(refreshed.access_token),
      refreshTokenCiphertext: encryptSecret(refreshed.refresh_token ?? currentRefreshToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      tokenType: refreshed.token_type,
      scopes: refreshed.scope,
      syncStatus: "PENDING",
    },
  });

  return NextResponse.json({
    spotifyAccountId: updated.id,
    tokenExpiresAt: updated.tokenExpiresAt,
  });
}
