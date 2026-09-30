export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-20">
      <div className="max-w-2xl space-y-6">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Obisan</p>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          Obsidian for music.
        </h1>
        <p className="text-lg leading-8 text-slate-300">
          A personal music knowledge graph that turns Spotify history, playlists, artists,
          albums, genres, moods, and listening patterns into a connected second brain.
        </p>
        <div className="flex items-center gap-4">
          <a
            className="rounded-full bg-violet-500 px-5 py-3 font-medium text-white transition hover:bg-violet-400"
            href="/api/auth/spotify/start"
          >
            Connect Spotify
          </a>
          <span className="text-sm text-slate-400">PKCE OAuth, encrypted tokens, sync queue</span>
        </div>
      </div>
    </main>
  );
}
