import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  APP_URL: z.string().url(),
  SPOTIFY_CLIENT_ID: z.string().min(1),
  SPOTIFY_CLIENT_SECRET: z.string().min(1),
  SPOTIFY_REDIRECT_URI: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  TOKEN_ENCRYPTION_KEY: z.string().min(32),
  INTERNAL_JOB_SECRET: z.string().min(32),
  SPOTIFY_SCOPES: z.string().default(
    "user-read-email user-read-private user-library-read playlist-read-private playlist-read-collaborative user-top-read user-read-recently-played user-follow-read"
  ),
});

export const env = envSchema.parse(process.env);
