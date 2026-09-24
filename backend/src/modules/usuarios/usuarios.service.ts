import type { Usuario } from "../../../generated/prisma/client";

export function validatePresupuestoRange(
  actual: Pick<Usuario, "presupuestoMin" | "presupuestoMax"> | null,
  patch: { presupuestoMin?: number; presupuestoMax?: number },
): string | null {
  if (patch.presupuestoMin === undefined && patch.presupuestoMax === undefined) {
    return null;
  }
  const min = patch.presupuestoMin ?? actual?.presupuestoMin?.toNumber() ?? null;
  const max = patch.presupuestoMax ?? actual?.presupuestoMax?.toNumber() ?? null;
  if (min === null || max === null || min <= max) return null;
  return "El presupuesto mínimo no puede ser mayor que el presupuesto máximo.";
}
