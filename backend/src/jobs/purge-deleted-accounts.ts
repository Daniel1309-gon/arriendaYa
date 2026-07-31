import { prisma } from "../db/prisma";
import { clearAccountRecoveryData } from "../modules/auth/account-recovery";

const DEFAULT_PURGE_INTERVAL_MS = 60 * 60 * 1000;
const PURGE_BATCH_SIZE = 100;

export async function purgeDeletedAccounts() {
  const now = new Date();
  const candidates = await prisma.usuario.findMany({
    where: {
      eliminadoEn: { not: null },
      eliminacionProgramadaEn: { lte: now },
    },
    select: { id: true, email: true },
    take: PURGE_BATCH_SIZE,
  });

  let purged = 0;
  let cleanupFailures = 0;

  for (const candidate of candidates) {
    try {
      // Clean user-scoped data first. If Redis is unavailable, leave the
      // account for the next run instead of deleting the database row and
      // leaving recoverable history behind.
      await clearAccountRecoveryData(candidate.id, candidate.email);
    } catch (error) {
      cleanupFailures += 1;
      console.error(
        `Failed to clean Redis data before purging account ${candidate.id}`,
        error,
      );
      continue;
    }

    // The date condition makes purge safe against a concurrent recovery:
    // recovery wins by clearing the dates, while purge wins by deleting the
    // row. Inmueble rows are removed by the database cascade.
    const deleted = await prisma.usuario.deleteMany({
      where: {
        id: candidate.id,
        eliminadoEn: { not: null },
        eliminacionProgramadaEn: { lte: now },
      },
    });

    if (deleted.count !== 1) continue;

    purged += 1;
  }

  return {
    scanned: candidates.length,
    purged,
    cleanupFailures,
  };
}

export function startDeletedAccountsPurgeJob(
  onError: (error: unknown) => void,
  intervalMs = DEFAULT_PURGE_INTERVAL_MS,
) {
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;

    try {
      const result = await purgeDeletedAccounts();
      if (result.purged > 0 || result.cleanupFailures > 0) {
        console.log("Deleted account purge completed", result);
      }
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };

  void run();
  const interval = setInterval(() => void run(), intervalMs);

  return () => clearInterval(interval);
}
