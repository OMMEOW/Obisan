export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-8">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold">Your graph is syncing.</h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          Phase 1 establishes the Spotify connection, encrypted token storage, and a durable sync
          queue. Graph, timeline, and AI layers will consume this normalized music graph.
        </p>
      </div>
    </main>
  );
}
