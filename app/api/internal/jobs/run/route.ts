import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { processSpotifySyncJob } from "@/lib/sync/spotify";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-internal-job-secret");
  if (secret !== env.INTERNAL_JOB_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "5");
  const batchSize = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 10)) : 5;
  const jobs = await prisma.syncJob.findMany({
    where: { status: "PENDING", runAfter: { lte: new Date() } },
    orderBy: { runAfter: "asc" },
    take: batchSize,
  });

  const results: Array<{ jobId: string; status: string }> = [];

  for (const job of jobs) {
    const claimed = await prisma.syncJob.updateMany({
      where: { id: job.id, status: "PENDING" },
      data: { status: "RUNNING", startedAt: new Date(), lockedAt: new Date(), attempts: job.attempts + 1 },
    });

    if (claimed.count === 0) continue;

    try {
      await processSpotifySyncJob(job.id);
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: "SUCCEEDED", completedAt: new Date(), lastError: null },
      });
      results.push({ jobId: job.id, status: "SUCCEEDED" });
    } catch (error) {
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: job.attempts + 1 >= job.maxAttempts ? "FAILED" : "PENDING",
          lastError: error instanceof Error ? error.message : "Unknown sync error",
          runAfter: job.attempts + 1 >= job.maxAttempts ? job.runAfter : new Date(Date.now() + 1000 * 60 * 5),
        },
      });
      results.push({ jobId: job.id, status: "FAILED" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
