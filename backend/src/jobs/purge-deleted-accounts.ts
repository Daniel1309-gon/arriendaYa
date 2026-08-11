import { prisma } from "../db/prisma";
import { clearAccountRecoveryData } from "../modules/auth/account-recovery";
import { borrarImagenesDeUsuario } from "../modules/inmuebles/imagenes.service";

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
      const current = await prisma.usuario.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          email: true,
          eliminadoEn: true,
          eliminacionProgramadaEn: true,
        },
      });
      if (
        !current?.eliminadoEn ||
        !current.eliminacionProgramadaEn ||
        current.eliminacionProgramadaEn > now
      ) {
        continue;
      }

      // Network calls stay outside the DB transaction. A failed cleanup aborts
      // this candidate and leaves it available for the next hourly retry.
      await clearAccountRecoveryData(current.id, current.email);
      const imageCleanup = await borrarImagenesDeUsuario(current.id);

      // This single conditional ORM operation is atomic and keeps all network
      // calls outside the database transaction.
      const deleted = await prisma.usuario.deleteMany({
        where: {
          id: current.id,
          eliminadoEn: { not: null },
          eliminacionProgramadaEn: { lte: now },
        },
      });

      if (deleted.count !== 1) continue;

      if (imageCleanup === "sin-cloudinary") {
        console.warn(
          `Purged account ${candidate.id} without cleaning Cloudinary: not configured`,
        );
      }

      purged += 1;
    } catch (error) {
      cleanupFailures += 1;
      console.error(
        `Failed to clean external data before purging account ${candidate.id}`,
        error,
      );
      continue;
    }
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
