import { prisma } from "@/lib/prisma";

export async function enqueueSpotifySyncJob(input: {
  userId: string;
  spotifyAccountId: string;
  kind: "INITIAL_SYNC" | "INCREMENTAL_SYNC";
}) {
  const existing = await prisma.syncJob.findFirst({
    where: {
      userId: input.userId,
      spotifyAccountId: input.spotifyAccountId,
      kind: input.kind,
      status: { in: ["PENDING", "RUNNING"] },
    },
  });

  if (existing) return existing;

  return prisma.syncJob.create({
    data: {
      userId: input.userId,
      spotifyAccountId: input.spotifyAccountId,
      kind: input.kind,
      status: "PENDING",
      runAfter: new Date(),
    },
  });
}
