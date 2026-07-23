import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { authenticate } from "../../plugins/authenticate";
import { mongoClient } from "../../db/mongo";

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
  url: z.string().optional(),
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
      const whereMongo: any = {};
      if (precioMin || precioMax) {
        whereMongo.valorCanon = {};
        if (precioMin) whereMongo.valorCanon.$gte = precioMin;
        if (precioMax) whereMongo.valorCanon.$lte = precioMax;
      }
      if (habitaciones) whereMongo.habitaciones = habitaciones;
      if (banos) whereMongo.banos = banos;
      if (estrato) whereMongo.estrato = estrato;

      const db = mongoClient.db("arriendaya_scraper");
      const inmueblesMongo = await db.collection("inmuebles_scrapeados")
        .find(whereMongo)
        .limit(25)
        .toArray();

      return {
        success: true,
        inmuebles: [...inmueblesPostgres, ...inmueblesMongo],
      };
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

      const inmueble = await prisma.inmueble.findUnique({
        where: { id },
      });

      if (!inmueble || inmueble.usuarioId !== userId) {
        return reply.status(403).send({
          success: false,
          message: "Unauthorized to modify this resource",
        });
      }

      await prisma.inmueble.delete({
        where: { id },
      });
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

      const inmueble = await prisma.inmueble.findUnique({
        where: { id },
      });

      if (!inmueble || inmueble.usuarioId !== userId) {
        return reply.status(403).send({
          success: false,
          message: "Unauthorized to modify this resource",
        });
      }

      const inmuebleActualizado = await prisma.inmueble.update({
        where: { id },
        data: dataToUpdate,
      });

      return { success: true, inmueble: inmuebleActualizado };
    },
  );
};
