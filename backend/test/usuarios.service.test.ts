import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../generated/prisma/client";
import { validatePresupuestoRange } from "../src/modules/usuarios/usuarios.service";

test("ambos campos enviados e invertidos: rechaza", () => {
  const actual = {
    presupuestoMin: new Prisma.Decimal("100"),
    presupuestoMax: new Prisma.Decimal("200"),
  };
  const resultado = validatePresupuestoRange(actual, {
    presupuestoMin: 1000000,
    presupuestoMax: 500000,
  });

  assert.notEqual(resultado, null);
});

test("ambos campos enviados y válidos: acepta", () => {
  const actual = {
    presupuestoMin: new Prisma.Decimal("1000000"),
    presupuestoMax: new Prisma.Decimal("500000"),
  };
  const resultado = validatePresupuestoRange(actual, {
    presupuestoMin: 500000,
    presupuestoMax: 1000000,
  });

  assert.equal(resultado, null);
});

test("valores mínimo y máximo iguales: acepta", () => {
  const resultado = validatePresupuestoRange(null, {
    presupuestoMin: 800000,
    presupuestoMax: 800000,
  });

  assert.equal(resultado, null);
});

test("actualización parcial: solo presupuestoMin, supera el presupuestoMax almacenado", () => {
  const actual = {
    presupuestoMin: null,
    presupuestoMax: new Prisma.Decimal("500000"),
  };
  const resultado = validatePresupuestoRange(actual, {
    presupuestoMin: 900000,
  });

  assert.notEqual(resultado, null);
});

test("actualización parcial: solo presupuestoMax, por debajo del presupuestoMin almacenado", () => {
  const actual = {
    presupuestoMin: new Prisma.Decimal("900000"),
    presupuestoMax: null,
  };
  const resultado = validatePresupuestoRange(actual, {
    presupuestoMax: 500000,
  });

  assert.notEqual(resultado, null);
});

test("actualización parcial: el otro límite está almacenado como null, acepta", () => {
  const actual = {
    presupuestoMin: null,
    presupuestoMax: null,
  };
  const resultado = validatePresupuestoRange(actual, {
    presupuestoMin: 900000,
  });

  assert.equal(resultado, null);
});

test("actualización de campo no relacionado con rango almacenado ya invertido: acepta", () => {
  const actual = {
    presupuestoMin: new Prisma.Decimal("1000000"),
    presupuestoMax: new Prisma.Decimal("500000"),
  };
  const resultado = validatePresupuestoRange(actual, {});

  assert.equal(resultado, null);
});

test("cero es un límite real: no se trata como ausente vía '??' en vez de '||'", () => {
  const actual = {
    presupuestoMin: new Prisma.Decimal("100"),
    presupuestoMax: null,
  };
  const resultado = validatePresupuestoRange(actual, {
    presupuestoMax: 0,
  });

  assert.notEqual(resultado, null);
});
