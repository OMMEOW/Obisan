import { env } from "@/lib/env";
import { randomUrlSafeToken, sha256Base64Url } from "@/lib/crypto";
import type {
  SpotifyAlbumRef,
  SpotifyArtistRef,
  SpotifyAudioFeature,
  SpotifyPlaylistObject,
  SpotifyTokenResponse,
  SpotifyTrackObject,
  SpotifyUserProfile,
} from "@/types/spotify";

const SPOTIFY_ACCOUNTS_BASE = "https://accounts.spotify.com";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export const SPOTIFY_SCOPES = env.SPOTIFY_SCOPES.split(/\s+/).filter(Boolean);

export function createSpotifyPkcePair() {
  const codeVerifier = randomUrlSafeToken(48);
  const codeChallenge = sha256Base64Url(codeVerifier);
  return { codeVerifier, codeChallenge };
}

export function buildSpotifyAuthorizeUrl(params: {
  state: string;
  codeChallenge: string;
  redirectUri?: string;
}) {
  const url = new URL(`${SPOTIFY_ACCOUNTS_BASE}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.SPOTIFY_CLIENT_ID);
  url.searchParams.set("redirect_uri", params.redirectUri ?? env.SPOTIFY_REDIRECT_URI);
  url.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", params.codeChallenge);
  return url.toString();
}

async function spotifyFetch<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Spotify API error ${response.status}: ${body}`);
  }

  return (await response.json()) as T;
}

async function spotifyTokenExchange(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Spotify token exchange failed: ${response.status} ${error}`);
  }

  return (await response.json()) as SpotifyTokenResponse;
}

export async function exchangeSpotifyCode(params: { code: string; codeVerifier: string }) {
  return spotifyTokenExchange(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: env.SPOTIFY_REDIRECT_URI,
      client_id: env.SPOTIFY_CLIENT_ID,
      client_secret: env.SPOTIFY_CLIENT_SECRET,
      code_verifier: params.codeVerifier,
    })
  );
}

export async function refreshSpotifyToken(refreshToken: string) {
  return spotifyTokenExchange(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env.SPOTIFY_CLIENT_ID,
      client_secret: env.SPOTIFY_CLIENT_SECRET,
    })
  );
}

export async function fetchSpotifyProfile(accessToken: string) {
  return spotifyFetch<SpotifyUserProfile>("/me", accessToken);
}

export async function fetchTopArtists(accessToken: string, timeRange: "short_term" | "medium_term" | "long_term" = "medium_term") {
  return spotifyFetch<{ items: Array<any> }>(`/me/top/artists?limit=50&time_range=${timeRange}`, accessToken);
}

export async function fetchTopTracks(accessToken: string, timeRange: "short_term" | "medium_term" | "long_term" = "medium_term") {
  return spotifyFetch<{ items: SpotifyTrackObject[] }>(`/me/top/tracks?limit=50&time_range=${timeRange}`, accessToken);
}

export async function fetchRecentlyPlayed(accessToken: string) {
  return spotifyFetch<{ items: Array<{ played_at: string; track: SpotifyTrackObject; context: { type: string; uri: string } | null }> }>(
    "/me/player/recently-played?limit=50",
    accessToken
  );
}

export async function fetchSavedTracks(accessToken: string) {
  return spotifyFetch<{ items: Array<{ track: SpotifyTrackObject }> }>("/me/tracks?limit=50", accessToken);
}

export async function fetchSavedAlbums(accessToken: string) {
  return spotifyFetch<{ items: Array<{ album: SpotifyAlbumRef }> }>("/me/albums?limit=50", accessToken);
}

export async function fetchFollowedArtists(accessToken: string) {
  return spotifyFetch<{ artists: { items: Array<any> } }>("/me/following?type=artist&limit=50", accessToken);
}

export async function fetchPlaylists(accessToken: string) {
  return spotifyFetch<{ items: SpotifyPlaylistObject[] }>("/me/playlists?limit=50", accessToken);
}

export async function fetchAudioFeatures(accessToken: string, trackIds: string[]) {
  if (trackIds.length === 0) return [];

  const chunks: string[][] = [];
  for (let index = 0; index < trackIds.length; index += 100) {
    chunks.push(trackIds.slice(index, index + 100));
  }

  const features: SpotifyAudioFeature[] = [];
  for (const chunk of chunks) {
    if (chunk.length === 0) continue;
    const result = await spotifyFetch<{ audio_features: SpotifyAudioFeature[] }>(
      `/audio-features?ids=${chunk.join(",")}`,
      accessToken
    );
    features.push(...result.audio_features.filter((feature): feature is SpotifyAudioFeature => Boolean(feature)));
  }

  return features;
}

export function primaryImage(images: Array<{ url: string }> | undefined | null) {
  return images?.[0]?.url ?? null;
}
