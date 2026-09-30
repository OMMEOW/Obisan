# Phase 1 Design

## Architecture

Obisan uses Next.js route handlers for auth and sync orchestration, Prisma/PostgreSQL for the system of record, and a DB-backed queue for background work.

Why this over Redis-first jobs for MVP:

- Lower operational burden on Vercel.
- Durable retries without a separate worker stack.
- Easy to inspect and debug sync failures.

Spotify tokens are encrypted at the application layer before persistence.

## Folder Structure

```text
app/
  api/
    auth/spotify/start
    auth/spotify/callback
    auth/spotify/refresh
    internal/jobs/run
  dashboard
lib/
  crypto.ts
  env.ts
  jobs/spotify.ts
  prisma.ts
  session.ts
  spotify.ts
  sync/spotify.ts
prisma/schema.prisma
docs/
  roadmap.md
  phase-1.md
```

## Database Schema

Core tables:

- `User`
- `SpotifyAccount`
- `Artist`
- `Album`
- `Track`
- `Playlist`
- `Genre`
- `ListeningEvent`
- `TrackFeature`
- `Relationship`
- `Embedding`

Supporting tables:

- `ArtistGenre`
- `TrackArtist`
- `AlbumArtist`
- `SyncJob`

Design choices:

- Spotify IDs are unique natural keys.
- Graph edges are materialized in `Relationship`.
- Sync work is durable in `SyncJob` instead of relying on ephemeral serverless execution.
- Embeddings are stored as bytes for MVP portability; pgvector can replace this later without changing the subject model.

## API Routes

- `GET /api/auth/spotify/start`
- `GET /api/auth/spotify/callback`
- `POST /api/auth/spotify/refresh`
- `POST /api/internal/jobs/run`

## TypeScript Types

- `types/spotify.ts` defines the Spotify API payloads used by the auth and sync layers.

## Scalability

- DB-backed queue scales better for MVP than a dedicated worker service.
- Token refresh is isolated so later sync jobs can call it centrally.
- The schema separates source-of-truth entities from derived graph edges.

## Security

- PKCE OAuth.
- HTTP-only cookies for state and session.
- HMAC-signed session cookie.
- AES-GCM encrypted Spotify tokens.
- Internal job runner protected by `INTERNAL_JOB_SECRET`.

## Testing Strategy

- Unit test PKCE helpers, token encryption, session signing.
- Integration test OAuth callback and token refresh route.
- Prisma schema validation in CI.
- Sync job runner tests with mocked Spotify responses.
