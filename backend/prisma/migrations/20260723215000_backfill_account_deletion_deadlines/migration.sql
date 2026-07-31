-- Existing soft-deleted accounts need an explicit deadline so the purge job
-- can process them under the same 14-day policy.
UPDATE "Usuario"
SET "eliminacionProgramadaEn" = "eliminadoEn" + INTERVAL '14 days'
WHERE "eliminadoEn" IS NOT NULL
  AND "eliminacionProgramadaEn" IS NULL;
