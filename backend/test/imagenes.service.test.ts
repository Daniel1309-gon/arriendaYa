import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  borrarImagenesDeInmueble,
  borrarImagenesDeUsuario,
  ImagenNoValida,
  MAX_DIMENSION_POR_IMAGEN,
  normalizarImagen,
  publicIdDesdeUrl,
} from "../src/modules/inmuebles/imagenes.service";

test("normaliza una imagen raster a WebP", async () => {
  const entrada = await sharp({
    create: {
      width: 16,
      height: 12,
      channels: 3,
      background: { r: 20, g: 120, b: 80 },
    },
  })
    .jpeg()
    .toBuffer();

  const salida = await normalizarImagen(entrada);
  const metadata = await sharp(salida).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 16);
  assert.equal(metadata.height, 12);
});

test("descarta bytes añadidos al final de una imagen", async () => {
  const entrada = await sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: "blue",
    },
  })
    .jpeg()
    .toBuffer();
  const payload = Buffer.from('<script>alert("xss")</script>');

  const salida = await normalizarImagen(Buffer.concat([entrada, payload]));

  assert.equal(salida.includes(payload), false);
  assert.equal((await sharp(salida).metadata()).format, "webp");
});

test("rechaza SVG y archivos truncados aunque se presenten como imágenes", async () => {
  await assert.rejects(
    normalizarImagen(Buffer.from('<svg><script>alert("xss")</script></svg>')),
    ImagenNoValida,
  );
  await assert.rejects(
    normalizarImagen(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
    ImagenNoValida,
  );
});

test("rechaza imágenes con dimensiones excesivas", async () => {
  const entrada = await sharp({
    create: {
      width: MAX_DIMENSION_POR_IMAGEN + 1,
      height: 1,
      channels: 3,
      background: "red",
    },
  })
    .png()
    .toBuffer();

  await assert.rejects(normalizarImagen(entrada), ImagenNoValida);
});

test("sin Cloudinary configurado la limpieza no falla, informa", async () => {
  // Que falten las credenciales no puede bloquear el borrado de un inmueble ni
  // el purgado de una cuenta: en ese despliegue no hay assets que limpiar y
  // reintentar no lo arregla.
  const previas = {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  };
  delete process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_API_KEY;
  delete process.env.CLOUDINARY_API_SECRET;

  try {
    assert.equal(
      await borrarImagenesDeInmueble("usuario-1", "inmueble-1"),
      "sin-cloudinary",
    );
    assert.equal(await borrarImagenesDeUsuario("usuario-1"), "sin-cloudinary");
  } finally {
    for (const [clave, valor] of Object.entries(previas)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
  }
});

test("rechaza URLs Cloudinary que no pertenecen al formato canónico", () => {
  const anterior = process.env.CLOUDINARY_CLOUD_NAME;
  process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";

  try {
    assert.equal(
      publicIdDesdeUrl(
        "https://res.cloudinary.com/test-cloud/image/upload/v1/rentia/inmuebles/user/property/photo.webp",
      ),
      "rentia/inmuebles/user/property/photo",
    );
    assert.equal(
      publicIdDesdeUrl(
        "https://res.cloudinary.com/other-cloud/image/upload/v1/rentia/inmuebles/user/property/photo.webp",
      ),
      null,
    );
    assert.equal(
      publicIdDesdeUrl(
        "https://res.cloudinary.com/test-cloud/image/upload/v1/rentia/inmuebles/user/property/photo.webp?redirect=1",
      ),
      null,
    );
  } finally {
    if (anterior === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
    else process.env.CLOUDINARY_CLOUD_NAME = anterior;
  }
});
