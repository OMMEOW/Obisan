import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  fetchAudioFeatures,
  fetchFollowedArtists,
  fetchPlaylists,
  fetchRecentlyPlayed,
  fetchSavedAlbums,
  fetchSavedTracks,
  fetchSpotifyProfile,
  fetchTopArtists,
  fetchTopTracks,
  refreshSpotifyToken,
  primaryImage,
} from "@/lib/spotify";

export async function processSpotifySyncJob(jobId: string) {
  const job = await prisma.syncJob.findUnique({
    where: { id: jobId },
    include: { spotifyAccount: true },
  });

  if (!job) throw new Error(`Sync job ${jobId} not found`);

  if (job.kind === "INITIAL_SYNC") {
    await syncInitialSpotifyData(job.spotifyAccountId);
    return;
  }

  await syncIncrementalSpotifyData(job.spotifyAccountId);
}

async function getFreshAccessToken(spotifyAccountId: string) {
  const account = await prisma.spotifyAccount.findUnique({ where: { id: spotifyAccountId } });
  if (!account) throw new Error(`Spotify account ${spotifyAccountId} not found`);

  if (account.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return {
      account,
      accessToken: decryptSecret(account.accessTokenCiphertext),
      refreshToken: decryptSecret(account.refreshTokenCiphertext),
    };
  }

  const refreshToken = decryptSecret(account.refreshTokenCiphertext);
  const refreshed = await refreshSpotifyToken(refreshToken);

  const nextAccessToken = refreshed.access_token;
  const nextRefreshToken = refreshed.refresh_token ?? refreshToken;
  const tokenExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  const updated = await prisma.spotifyAccount.update({
    where: { id: spotifyAccountId },
    data: {
      accessTokenCiphertext: encryptSecret(nextAccessToken),
      refreshTokenCiphertext: encryptSecret(nextRefreshToken),
      tokenExpiresAt,
    },
  });

  return {
    account: updated,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  };
}

function normalizeGenreName(name: string) {
  return name.trim().toLowerCase();
}

async function upsertArtist(params: {
  spotifyId: string;
  name: string;
  uri?: string;
  imageUrl?: string | null;
  popularity?: number | null;
  genres?: string[];
}) {
  const artist = await prisma.artist.upsert({
    where: { spotifyId: params.spotifyId },
    create: {
      spotifyId: params.spotifyId,
      name: params.name,
      uri: params.uri ?? `spotify:artist:${params.spotifyId}`,
      imageUrl: params.imageUrl ?? null,
      popularity: params.popularity ?? null,
    },
    update: {
      name: params.name,
      uri: params.uri ?? `spotify:artist:${params.spotifyId}`,
      imageUrl: params.imageUrl ?? null,
      popularity: params.popularity ?? null,
    },
  });

  if (params.genres?.length) {
    for (const genreName of params.genres) {
      const normalized = normalizeGenreName(genreName);
      const genre = await prisma.genre.upsert({
        where: { normalizedName: normalized },
        create: { displayName: genreName.trim(), normalizedName: normalized },
        update: { displayName: genreName.trim() },
      });

      await prisma.artistGenre.upsert({
        where: { artistId_genreId: { artistId: artist.id, genreId: genre.id } },
        create: { artistId: artist.id, genreId: genre.id },
        update: {},
      });
    }
  }

  return artist;
}

async function upsertAlbum(params: {
  spotifyId: string;
  name: string;
  uri?: string;
  imageUrl?: string | null;
  albumType?: string;
  totalTracks?: number;
  releaseDate?: string;
  releaseDatePrecision?: "day" | "month" | "year";
}) {
  return prisma.album.upsert({
    where: { spotifyId: params.spotifyId },
    create: {
      spotifyId: params.spotifyId,
      name: params.name,
      uri: params.uri ?? `spotify:album:${params.spotifyId}`,
      imageUrl: params.imageUrl ?? null,
      albumType: params.albumType ?? null,
      totalTracks: params.totalTracks ?? null,
      releaseDate: params.releaseDate ?? null,
      releaseDatePrecision: params.releaseDatePrecision ?? null,
    },
    update: {
      name: params.name,
      uri: params.uri ?? `spotify:album:${params.spotifyId}`,
      imageUrl: params.imageUrl ?? null,
      albumType: params.albumType ?? null,
      totalTracks: params.totalTracks ?? null,
      releaseDate: params.releaseDate ?? null,
      releaseDatePrecision: params.releaseDatePrecision ?? null,
    },
  });
}

async function upsertTrack(params: {
  spotifyId: string;
  name: string;
  uri?: string;
  albumId?: string | null;
  explicit?: boolean;
  popularity?: number | null;
  durationMs?: number | null;
  discNumber?: number | null;
  trackNumber?: number | null;
  previewUrl?: string | null;
}) {
  return prisma.track.upsert({
    where: { spotifyId: params.spotifyId },
    create: {
      spotifyId: params.spotifyId,
      name: params.name,
      uri: params.uri ?? `spotify:track:${params.spotifyId}`,
      albumId: params.albumId ?? null,
      explicit: params.explicit ?? false,
      popularity: params.popularity ?? null,
      durationMs: params.durationMs ?? null,
      discNumber: params.discNumber ?? null,
      trackNumber: params.trackNumber ?? null,
      previewUrl: params.previewUrl ?? null,
    },
    update: {
      name: params.name,
      uri: params.uri ?? `spotify:track:${params.spotifyId}`,
      albumId: params.albumId ?? null,
      explicit: params.explicit ?? false,
      popularity: params.popularity ?? null,
      durationMs: params.durationMs ?? null,
      discNumber: params.discNumber ?? null,
      trackNumber: params.trackNumber ?? null,
      previewUrl: params.previewUrl ?? null,
    },
  });
}

async function attachTrackArtists(trackId: string, artistIds: string[]) {
  for (const artistId of artistIds) {
    await prisma.trackArtist.upsert({
      where: { trackId_artistId: { trackId, artistId } },
      create: { trackId, artistId },
      update: {},
    });
  }
}

async function attachAlbumArtists(albumId: string, artistIds: string[]) {
  for (const artistId of artistIds) {
    await prisma.albumArtist.upsert({
      where: { albumId_artistId: { albumId, artistId } },
      create: { albumId, artistId },
      update: {},
    });
  }
}

async function createListeningEvent(input: {
  userId: string;
  spotifyAccountId: string;
  trackId: string;
  playedAt: string;
  origin: string;
  contextType?: string | null;
  contextUri?: string | null;
}) {
  const dedupeKey = `${input.spotifyAccountId}:${input.trackId}:${input.playedAt}`;
  await prisma.listeningEvent.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      userId: input.userId,
      spotifyAccountId: input.spotifyAccountId,
      trackId: input.trackId,
      playedAt: new Date(input.playedAt),
      origin: input.origin,
      contextType: input.contextType ?? null,
      contextUri: input.contextUri ?? null,
    },
    update: {},
  });
}

async function upsertTrackFeature(trackId: string, feature: any) {
  await prisma.trackFeature.upsert({
    where: { trackId },
    create: {
      trackId,
      acousticness: feature.acousticness,
      danceability: feature.danceability,
      energy: feature.energy,
      instrumentalness: feature.instrumentalness,
      liveness: feature.liveness,
      loudness: feature.loudness,
      speechiness: feature.speechiness,
      tempo: feature.tempo,
      valence: feature.valence,
      key: feature.key,
      mode: feature.mode,
      timeSignature: feature.time_signature,
      durationMs: feature.duration_ms,
      analysisVersion: "spotify-web-api",
    },
    update: {
      acousticness: feature.acousticness,
      danceability: feature.danceability,
      energy: feature.energy,
      instrumentalness: feature.instrumentalness,
      liveness: feature.liveness,
      loudness: feature.loudness,
      speechiness: feature.speechiness,
      tempo: feature.tempo,
      valence: feature.valence,
      key: feature.key,
      mode: feature.mode,
      timeSignature: feature.time_signature,
      durationMs: feature.duration_ms,
      analysisVersion: "spotify-web-api",
    },
  });
}

async function syncCoreSnapshot(spotifyAccountId: string) {
  const { account, accessToken } = await getFreshAccessToken(spotifyAccountId);
  const profile = await fetchSpotifyProfile(accessToken);

  const topArtists = await fetchTopArtists(accessToken);
  const topTracks = await fetchTopTracks(accessToken);
  const recentlyPlayed = await fetchRecentlyPlayed(accessToken);
  const savedTracks = await fetchSavedTracks(accessToken);
  const savedAlbums = await fetchSavedAlbums(accessToken);
  const followedArtists = await fetchFollowedArtists(accessToken);
  const playlists = await fetchPlaylists(accessToken);

  await prisma.spotifyAccount.update({
    where: { id: spotifyAccountId },
    data: {
      spotifyDisplayName: profile.display_name,
      spotifyEmail: profile.email ?? null,
      spotifyCountry: profile.country ?? null,
      spotifyProduct: profile.product ?? null,
      spotifyImageUrl: primaryImage(profile.images),
      spotifyFollowers: profile.followers.total,
    },
  });

  const trackIds = new Set<string>();

  for (const artist of [...topArtists.items, ...followedArtists.artists.items]) {
    if (!artist?.id) continue;
    const saved = await upsertArtist({
      spotifyId: artist.id,
      name: artist.name,
      uri: artist.uri,
      imageUrl: primaryImage(artist.images),
      popularity: artist.popularity ?? null,
      genres: artist.genres ?? [],
    });
  }

  for (const playlist of playlists.items) {
    await prisma.playlist.upsert({
      where: { spotifyId: playlist.id },
      create: {
        spotifyId: playlist.id,
        name: playlist.name,
        uri: playlist.uri,
        description: playlist.description,
        imageUrl: primaryImage(playlist.images),
        isPublic: playlist.public,
        collaborative: playlist.collaborative,
        snapshotId: playlist.snapshot_id,
        trackCount: playlist.tracks.total,
        ownerSpotifyId: playlist.owner.id,
        ownerDisplayName: playlist.owner.display_name,
      },
      update: {
        name: playlist.name,
        uri: playlist.uri,
        description: playlist.description,
        imageUrl: primaryImage(playlist.images),
        isPublic: playlist.public,
        collaborative: playlist.collaborative,
        snapshotId: playlist.snapshot_id,
        trackCount: playlist.tracks.total,
        ownerSpotifyId: playlist.owner.id,
        ownerDisplayName: playlist.owner.display_name,
      },
    });
  }

  for (const savedAlbum of savedAlbums.items) {
    await upsertAlbum({
      spotifyId: savedAlbum.album.id,
      name: savedAlbum.album.name,
      uri: savedAlbum.album.uri,
      imageUrl: primaryImage(savedAlbum.album.images),
      albumType: savedAlbum.album.album_type,
      totalTracks: savedAlbum.album.total_tracks,
      releaseDate: savedAlbum.album.release_date,
      releaseDatePrecision: savedAlbum.album.release_date_precision,
    });
  }

  for (const trackWrapper of savedTracks.items) {
    const track = trackWrapper.track;
    if (!track?.id) continue;
    trackIds.add(track.id);

    const album = await upsertAlbum({
      spotifyId: track.album.id,
      name: track.album.name,
      uri: track.album.uri,
      imageUrl: primaryImage(track.album.images),
      albumType: track.album.album_type,
      totalTracks: track.album.total_tracks,
      releaseDate: track.album.release_date,
      releaseDatePrecision: track.album.release_date_precision,
    });

    const saved = await upsertTrack({
      spotifyId: track.id,
      name: track.name,
      uri: track.uri,
      albumId: album.id,
      explicit: track.explicit,
      popularity: track.popularity,
      durationMs: track.duration_ms,
      discNumber: track.disc_number,
      trackNumber: track.track_number,
      previewUrl: track.preview_url,
    });

    const localArtistIds: string[] = [];
    for (const artist of track.artists) {
      const artistRow = await upsertArtist({ spotifyId: artist.id, name: artist.name, uri: artist.uri });
      localArtistIds.push(artistRow.id);
    }
    await attachTrackArtists(saved.id, localArtistIds);
    await attachAlbumArtists(album.id, localArtistIds);
  }

  for (const track of topTracks.items) {
    if (!track?.id) continue;
    trackIds.add(track.id);

    const album = await upsertAlbum({
      spotifyId: track.album.id,
      name: track.album.name,
      uri: track.album.uri,
      imageUrl: primaryImage(track.album.images),
      albumType: track.album.album_type,
      totalTracks: track.album.total_tracks,
      releaseDate: track.album.release_date,
      releaseDatePrecision: track.album.release_date_precision,
    });

    const saved = await upsertTrack({
      spotifyId: track.id,
      name: track.name,
      uri: track.uri,
      albumId: album.id,
      explicit: track.explicit,
      popularity: track.popularity,
      durationMs: track.duration_ms,
      discNumber: track.disc_number,
      trackNumber: track.track_number,
      previewUrl: track.preview_url,
    });

    const localArtistIds: string[] = [];
    for (const artist of track.artists) {
      const artistRow = await upsertArtist({ spotifyId: artist.id, name: artist.name, uri: artist.uri });
      localArtistIds.push(artistRow.id);
    }
    await attachTrackArtists(saved.id, localArtistIds);
    await attachAlbumArtists(album.id, localArtistIds);
  }

  for (const recent of recentlyPlayed.items) {
    const track = recent.track;
    if (!track?.id) continue;
    trackIds.add(track.id);

    const album = await upsertAlbum({
      spotifyId: track.album.id,
      name: track.album.name,
      uri: track.album.uri,
      imageUrl: primaryImage(track.album.images),
      albumType: track.album.album_type,
      totalTracks: track.album.total_tracks,
      releaseDate: track.album.release_date,
      releaseDatePrecision: track.album.release_date_precision,
    });

    const saved = await upsertTrack({
      spotifyId: track.id,
      name: track.name,
      uri: track.uri,
      albumId: album.id,
      explicit: track.explicit,
      popularity: track.popularity,
      durationMs: track.duration_ms,
      discNumber: track.disc_number,
      trackNumber: track.track_number,
      previewUrl: track.preview_url,
    });

    const localArtistIds: string[] = [];
    for (const artist of track.artists) {
      const artistRow = await upsertArtist({ spotifyId: artist.id, name: artist.name, uri: artist.uri });
      localArtistIds.push(artistRow.id);
    }
    await attachTrackArtists(saved.id, localArtistIds);
    await attachAlbumArtists(album.id, localArtistIds);

    await createListeningEvent({
      userId: account.userId,
      spotifyAccountId: account.id,
      trackId: saved.id,
      playedAt: recent.played_at,
      origin: "recently_played",
      contextType: recent.context?.type ?? null,
      contextUri: recent.context?.uri ?? null,
    });
  }

  const audioFeatures = await fetchAudioFeatures(accessToken, [...trackIds]);
  const trackIdBySpotifyId = new Map(
    (
      await prisma.track.findMany({
        where: { spotifyId: { in: [...trackIds] } },
        select: { id: true, spotifyId: true },
      })
    ).map((track) => [track.spotifyId, track.id])
  );

  for (const feature of audioFeatures) {
    const trackId = trackIdBySpotifyId.get(feature.id);
    if (!trackId) continue;
    await upsertTrackFeature(trackId, feature);
  }

  await prisma.spotifyAccount.update({
    where: { id: spotifyAccountId },
    data: {
      lastSyncedAt: new Date(),
      initialSyncCompletedAt: account.initialSyncCompletedAt ?? new Date(),
      syncStatus: "IDLE",
      needsInitialSync: false,
    },
  });
}

async function syncInitialSpotifyData(spotifyAccountId: string) {
  await syncCoreSnapshot(spotifyAccountId);
}

async function syncIncrementalSpotifyData(spotifyAccountId: string) {
  await syncCoreSnapshot(spotifyAccountId);
}
