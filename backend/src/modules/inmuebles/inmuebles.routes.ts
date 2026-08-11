import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyReply } from "fastify";
import type { MultipartFile } from "@fastify/multipart";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../db/prisma";
import { authenticate } from "../../plugins/authenticate";
import { MONGO_COLLECTION, MONGO_DB, mongoClient } from "../../db/mongo";
import {
  serializarInmueblePropio,
  serializarInmuebleScrapeado,
} from "./inmuebles.serialize";
import {
  borrarImagen,
  borrarImagenesDeInmueble,
  borrarImagenPorPublicId,
  CloudinaryNoConfigurado,
  ImagenNoValida,
  MAX_BYTES_TOTALES_POR_SOLICITUD,
  MAX_IMAGENES_POR_INMUEBLE,
  normalizarImagen,
  subirImagen,
} from "./imagenes.service";

class CupoImagenesAgotado extends Error {}

const ERRORES_MULTIPART_CON_LIMITE = new Set([
  "FST_REQ_FILE_TOO_LARGE",
  "FST_FILES_LIMIT",
  "FST_FIELDS_LIMIT",
  "FST_PARTS_LIMIT",
]);

const ERRORES_MULTIPART_INVALIDOS = new Set([
  "FST_INVALID_MULTIPART_CONTENT_TYPE",
  "FST_MP_PREMATURE_CLOSE",
]);

function esErrorMultipartConLimite(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    ERRORES_MULTIPART_CON_LIMITE.has(error.code)
  );
}

/**
 * Consume un archivo del multipart sin guardarlo.
 *
 * Hay que drenarlo igual: busboy no emite la siguiente parte hasta que la
 * actual termine, y cortar el stream a mitad le deja al cliente una conexión
 * reseteada en vez del código de error. `pipeline` espera al final real del
 * stream y convierte un fallo en un rechazo de la promesa, que atrapa el mismo
 * try/catch que el resto del recorrido.
 */
async function descartarArchivo(part: MultipartFile): Promise<void> {
  await pipeline(part.file, async (source) => {
    for await (const _ of source) {
      // Sin cuerpo: el objetivo es vaciar el stream, no leerlo.
    }
  });
}

function esErrorMultipartInvalido(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    ERRORES_MULTIPART_INVALIDOS.has(error.code)
  );
}

async function transaccionSerializable<T>(operacion: () => Promise<T>): Promise<T> {
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      return await operacion();
    } catch (error) {
      const esConflicto =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!esConflicto || intento === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (intento + 1)));
    }
  }
  throw new Error("No se pudo completar la transacción");
}

// El `protocol` va dentro de z.url() y no en un .refine() aparte: en Zod 4 los
// checks encadenados no abortan, así que un refine con `new URL(value)` se
// ejecuta igual sobre un valor que ya falló el formato y lanza un TypeError
// crudo — 500 en vez del 400 de validación.
const UrlHttpSchema = z.url({ protocol: /^https?$/ });

const CreateInmuebleSchema = z.object({
  valorCanon: z.number(),
  administracionIncluida: z.boolean(),
  valorAdministracion: z.number().optional(),
  tamanoM2: z.number().int(),
  habitaciones: z.number().int(),
  banos: z.number().int(),
  patio: z.boolean().default(false),
  parqueaderos: z.number().int().default(0),
  antiguedadAnos: z.number().int(),
  estrato: z.number().int().min(1).max(6),
  piso: z.number().int(),
  ascensor: z.boolean().default(false),
  petFriendly: z.boolean().default(false),
  latitud: z.number(),
  longitud: z.number(),
  url: UrlHttpSchema.optional(),
  descripcion: z.string().max(2000).optional(),
});

export const inmueblesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/",
    {
      preValidation: authenticate,
      schema: {
        body: CreateInmuebleSchema,
      },
      config: {
        rateLimit: {
          max: 5, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;
      const data = request.body;

      const nuevoInmueble = await prisma.inmueble.create({
        data: {
          ...data,
          usuarioId: userId,
        },
      });

      return { success: true, inmueble: nuevoInmueble };
    },
  );

  const GetInmueblesQuerySchema = z.object({
    precioMin: z.coerce.number().optional(),
    precioMax: z.coerce.number().optional(),
    habitaciones: z.coerce.number().optional(),
    banos: z.coerce.number().optional(),
    estrato: z.coerce.number().optional(),
  });

  app.get(
    "/",
    {
      schema: {
        querystring: GetInmueblesQuerySchema,
      },
      config: {
        rateLimit: {
          max: 30, // Maximum number of requests
          timeWindow: "1 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const { precioMin, precioMax, habitaciones, banos, estrato } = request.query;

      // 1. Filtros dinámicos para Postgres (Prisma)
      const wherePrisma: any = {
        usuario: { eliminadoEn: null },
      };
      if (precioMin || precioMax) {
        wherePrisma.valorCanon = {};
        if (precioMin) wherePrisma.valorCanon.gte = precioMin;
        if (precioMax) wherePrisma.valorCanon.lte = precioMax;
      }
      if (habitaciones) wherePrisma.habitaciones = habitaciones;
      if (banos) wherePrisma.banos = banos;
      if (estrato) wherePrisma.estrato = estrato;

      const inmueblesPostgres = await prisma.inmueble.findMany({
        where: wherePrisma,
        take: 25,
      });

      // 2. Filtros dinámicos equivalentes para MongoDB
      const whereMongo: any = { activo: { $ne: false } };
      if (precioMin || precioMax) {
        whereMongo.valorCanon = {};
        if (precioMin) whereMongo.valorCanon.$gte = precioMin;
        if (precioMax) whereMongo.valorCanon.$lte = precioMax;
      }
      if (habitaciones) whereMongo.habitaciones = habitaciones;
      if (banos) whereMongo.banos = banos;
      if (estrato) whereMongo.estrato = estrato;

      const db = mongoClient.db(MONGO_DB);
      const inmueblesMongo = await db.collection(MONGO_COLLECTION)
        .find(whereMongo)
        .limit(25)
        .toArray();

      return {
        success: true,
        inmuebles: [
          ...inmueblesPostgres.map(serializarInmueblePropio),
          ...inmueblesMongo.map(serializarInmuebleScrapeado),
        ],
      };
    },
  );

  app.get(
    "/mios",
    {
      preValidation: authenticate,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;
      const inmuebles = await prisma.inmueble.findMany({
        where: { usuarioId: userId },
      });
      return { success: true, inmuebles: inmuebles.map(serializarInmueblePropio) };
    },
  );

  app.get(
    "/:id",
    {
      config: {
        rateLimit: {
          max: 60,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // Mismo criterio de visibilidad que GET "/": nada de un dueño con la
      // cuenta en soft-delete. findFirst con id (PK) en el where es tan
      // eficiente como findUnique.
      const propio = await prisma.inmueble.findFirst({
        where: { id, usuario: { eliminadoEn: null } },
      });
      if (propio) {
        return { success: true, inmueble: serializarInmueblePropio(propio) };
      }

      // Los ids de las dos fuentes no se pisan (uuid vs "fincaraiz-123"), así
      // que no hay ambigüedad en probar Mongo después de que Postgres no dé
      // nada. A diferencia de GET "/" no se filtra por `activo`: quien pide
      // el detalle por id puede venir de su historial de vistas, y ahí
      // conviene mostrar "ya no disponible" en vez de un 404 seco.
      const db = mongoClient.db(MONGO_DB);
      const scrapeado = await db.collection(MONGO_COLLECTION).findOne({ id });
      if (scrapeado) {
        return { success: true, inmueble: serializarInmuebleScrapeado(scrapeado) };
      }

      return reply.status(404).send({
        success: false,
        message: "Inmueble no encontrado",
      });
    },
  );

  /** Devuelve el inmueble si existe y es del usuario; si no, responde y da null. */
  async function inmueblePropioOrForbidden(
    id: string,
    userId: string,
    reply: FastifyReply,
  ) {
    const inmueble = await prisma.inmueble.findUnique({ where: { id } });
    if (!inmueble || inmueble.usuarioId !== userId) {
      // Mismo mensaje para "no existe" y "no es tuyo": distinguirlos permitiría
      // sondear qué ids existen.
      await reply.status(403).send({
        success: false,
        message: "Unauthorized to modify this resource",
      });
      return null;
    }
    return inmueble;
  }

  app.post(
    "/:id/imagenes",
    {
      preValidation: authenticate,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "5 minute",
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.id;

      const inmueble = await inmueblePropioOrForbidden(id, userId, reply);
      if (!inmueble) return reply;

      const yaSubidas = inmueble.imagenes.length;
      const validas: Buffer[] = [];
      let rechazo: { status: number; message: string } | null = null;
      let bytesTotales = 0;

      // Se valida todo antes de subir nada, y el bucle recorre el multipart
      // completo aunque ya haya un rechazo. Cortar a mitad del stream deja al
      // cliente con la conexión reseteada en vez de con el código de error.
      // Las imágenes se normalizan antes de llegar a Cloudinary y se limita
      // también el tamaño total, no sólo el tamaño de cada archivo.
      try {
        for await (const part of request.files()) {
          // Con un rechazo ya decidido la respuesta no va a cambiar, así que el
          // archivo se descarta a medida que llega en vez de materializarlo:
          // buffear los 10 permitidos costaría 50 MB por solicitud, el doble
          // del tope total, y sólo para tirarlos.
          if (rechazo) {
            await descartarArchivo(part);
            continue;
          }

          const buffer = await part.toBuffer();

          if (part.fieldname !== "imagenes") {
            rechazo = {
              status: 400,
              message: "El campo de archivos debe llamarse imagenes",
            };
            continue;
          }

          bytesTotales += buffer.length;
          if (bytesTotales > MAX_BYTES_TOTALES_POR_SOLICITUD) {
            rechazo = {
              status: 413,
              message: "El tamaño total de las imágenes supera el límite permitido",
            };
            continue;
          }

          if (yaSubidas + validas.length >= MAX_IMAGENES_POR_INMUEBLE) {
            rechazo = {
              status: 400,
              message: `Un inmueble admite máximo ${MAX_IMAGENES_POR_INMUEBLE} imágenes`,
            };
            continue;
          }

          try {
            validas.push(await normalizarImagen(buffer));
          } catch (error) {
            if (!(error instanceof ImagenNoValida)) throw error;
            rechazo = {
              status: 415,
              message: "Sólo se aceptan imágenes JPEG, PNG o WebP válidas",
            };
          }
        }
      } catch (error) {
        if (esErrorMultipartConLimite(error)) {
          return reply.status(413).send({
            success: false,
            message: "El tamaño o la cantidad de archivos supera el límite permitido",
          });
        }
        if (esErrorMultipartInvalido(error)) {
          return reply.status(400).send({
            success: false,
            message: "La solicitud multipart no es válida",
          });
        }
        throw error;
      }

      if (rechazo) {
        return reply
          .status(rechazo.status)
          .send({ success: false, message: rechazo.message });
      }

      if (validas.length === 0) {
        return reply.status(400).send({
          success: false,
          message: "No se recibió ninguna imagen",
        });
      }

      const urlsNuevas: string[] = [];
      const publicIdsNuevos: string[] = [];
      const limpiarSubidas = async () => {
        const resultados = await Promise.allSettled(
          publicIdsNuevos.map((publicId) => borrarImagenPorPublicId(publicId)),
        );
        for (const resultado of resultados) {
          if (resultado.status === "rejected") {
            request.log.error(
              resultado.reason,
              "No se pudo limpiar una imagen fallida en Cloudinary",
            );
          }
        }
      };

      try {
        for (const buffer of validas) {
          const subida = await subirImagen(buffer, {
            usuarioId: userId,
            inmuebleId: id,
          });
          urlsNuevas.push(subida.url);
          publicIdsNuevos.push(subida.publicId);
        }
      } catch (error) {
        await limpiarSubidas();
        if (error instanceof CloudinaryNoConfigurado) {
          request.log.error(error);
          return reply.status(503).send({
            success: false,
            message: "La subida de imágenes no está disponible en este momento",
          });
        }
        throw error;
      }

      let actualizado;
      try {
        actualizado = await transaccionSerializable(() =>
          prisma.$transaction(async (tx) => {
            // Serializable evita que dos uploads concurrentes lean el mismo
            // cupo y superen el máximo de imágenes.
            const estadoActual = await tx.inmueble.findUnique({ where: { id } });
            if (!estadoActual) throw new Error("El inmueble ya no existe");
            if (
              estadoActual.imagenes.length + urlsNuevas.length >
              MAX_IMAGENES_POR_INMUEBLE
            ) {
              throw new CupoImagenesAgotado();
            }

            return tx.inmueble.update({
              where: { id },
              data: { imagenes: { push: urlsNuevas } },
            });
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
        );
      } catch (error) {
        await limpiarSubidas();
        if (error instanceof CupoImagenesAgotado) {
          return reply.status(400).send({
            success: false,
            message: `Un inmueble admite máximo ${MAX_IMAGENES_POR_INMUEBLE} imágenes`,
          });
        }
        throw error;
      }

      return { success: true, imagenes: actualizado.imagenes };
    },
  );

  const BorrarImagenSchema = z.object({ url: z.string() });

  app.delete(
    "/:id/imagenes",
    {
      preValidation: authenticate,
      schema: {
        body: BorrarImagenSchema,
      },
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "5 minute",
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.id;
      const { url } = request.body;

      const inmueble = await inmueblePropioOrForbidden(id, userId, reply);
      if (!inmueble) return reply;

      if (!inmueble.imagenes.includes(url)) {
        return reply.status(404).send({
          success: false,
          message: "Esa imagen no pertenece al inmueble",
        });
      }

      // Primero la fila: si Cloudinary falla, peor es dejar la card apuntando
      // a un asset que el usuario ya quiso quitar. El huérfano se limpia aparte.
      const actualizado = await prisma.inmueble.update({
        where: { id },
        data: { imagenes: inmueble.imagenes.filter((actual) => actual !== url) },
      });

      try {
        await borrarImagen(url);
      } catch (error) {
        request.log.error(error, "No se pudo borrar la imagen en Cloudinary");
      }

      return { success: true, imagenes: actualizado.imagenes };
    },
  );

  app.delete(
    "/:id",
    {
      preValidation: authenticate,
      config: {
        rateLimit: {
          max: 10, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.id;

      if (!(await inmueblePropioOrForbidden(id, userId, reply))) return reply;

      try {
        // La llamada de red va fuera de la transacción para no retener un lock
        // de PostgreSQL durante el timeout de Cloudinary.
        const limpieza = await borrarImagenesDeInmueble(userId, id);
        await prisma.inmueble.delete({ where: { id } });

        // Una subida concurrente pudo llegar al prefijo después de la primera
        // pasada. La segunda pasada también queda fuera de la transacción.
        const limpiezaFinal = await borrarImagenesDeInmueble(userId, id);

        if (limpieza === "sin-cloudinary" || limpiezaFinal === "sin-cloudinary") {
          request.log.warn(
            { inmuebleId: id },
            "Inmueble eliminado sin limpiar Cloudinary: no está configurado",
          );
        }
      } catch (error) {
        request.log.error(error, "No se pudo eliminar el inmueble y sus imágenes");
        return reply.status(502).send({
          success: false,
          message: "No se pudo completar la eliminación del inmueble",
        });
      }
      return { success: true, message: "Inmueble eliminado correctamente" };
    },
  );

  app.put(
    "/:id",
    {
      preValidation: authenticate,
      schema: {
        body: CreateInmuebleSchema.partial(),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const userId = request.user.id;
      const dataToUpdate = request.body;

      if (!(await inmueblePropioOrForbidden(id, userId, reply))) return reply;

      const inmuebleActualizado = await prisma.inmueble.update({
        where: { id },
        data: dataToUpdate,
      });

      return { success: true, inmueble: inmuebleActualizado };
    },
  );
};
