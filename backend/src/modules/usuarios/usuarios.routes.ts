import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { authenticate } from "../../plugins/authenticate";
import { redisClient } from "../../db/redis";
import { MONGO_COLLECTION, MONGO_DB, mongoClient } from "../../db/mongo";
import {
  ACCOUNT_DELETION_GRACE_PERIOD_MS,
  clearAccountRecoveryData,
} from "../auth/account-recovery";
import { sendAccountDeletionScheduledEmail } from "../../email/mailer";
import {
  serializarInmueblePropio,
  serializarInmuebleScrapeado,
} from "../inmuebles/inmuebles.serialize";
import { validatePresupuestoRange } from "./usuarios.service";

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:5173";

const UpdatePerfilSchema = z.object({
  zonasInteres: z.array(z.string()).optional(),
  edad: z.number().int().optional(),
  ciudadOrigen: z.string().optional(),
  telefono: z.string().optional(),
  presupuestoMin: z.number().nonnegative().optional(),
  presupuestoMax: z.number().nonnegative().optional(),
});

const AddHistorialSchema = z.object({
  inmuebleId: z.string(),
});

export const usuariosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/perfil",
    {
      preValidation: authenticate,
      config: {
        rateLimit: {
          max: 60, // Maximum number of requests
          timeWindow: "1 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;

      const perfil = await prisma.usuario.findUnique({
        where: { id: userId },
      });

      return { success: true, perfil };
    },
  );

  app.put(
    "/perfil",
    {
      preValidation: authenticate,
      schema: {
        body: UpdatePerfilSchema,
      },
      config: {
        rateLimit: {
          max: 10, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;
      const dataToUpdate = request.body;

      if (
        dataToUpdate.presupuestoMin !== undefined ||
        dataToUpdate.presupuestoMax !== undefined
      ) {
        // ponytail: read-then-write race; DB CHECK (presupuestoMin <= presupuestoMax) is the follow-up
        const actual = await prisma.usuario.findUnique({
          where: { id: userId },
          select: { presupuestoMin: true, presupuestoMax: true },
        });
        const error = validatePresupuestoRange(actual, dataToUpdate);
        if (error) {
          return reply.status(400).send({ success: false, error });
        }
      }

      const perfilActualizado = await prisma.usuario.update({
        where: { id: userId },
        data: dataToUpdate,
      });

      return { success: true, perfil: perfilActualizado };
    },
  );

  app.post(
    "/historial",
    {
      preValidation: authenticate,
      schema: { body: AddHistorialSchema },
      config: {
        rateLimit: {
          max: 60, // Maximum number of requests
          timeWindow: "1 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;
      const { inmuebleId } = request.body;

      const key = `user:${userId}:history`;

      await redisClient.lpush(key, inmuebleId);

      await redisClient.ltrim(key, 0, 9);

      return { success: true, message: "Inmueble agregado al historial" };
    },
  );

  app.get(
    "/historial",
    {
      preValidation: authenticate,
      config: {
        rateLimit: {
          max: 60, // Maximum number of requests
          timeWindow: "1 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;

      const key = `user:${userId}:history`;

      const inmuebleIds = await redisClient.lrange(key, 0, 9);

      if (inmuebleIds.length === 0) {
        return { success: true, historial: [] };
      }

      const inmueblesPostgres = await prisma.inmueble.findMany({
        where: { id: { in: inmuebleIds } },
      });

      const db = mongoClient.db(MONGO_DB);
      const inmueblesMongo = await db
        .collection(MONGO_COLLECTION)
        .find({ id: { $in: inmuebleIds } })
        .toArray();
      return {
        success: true,
        historial: [
          ...inmueblesPostgres.map(serializarInmueblePropio),
          ...inmueblesMongo.map(serializarInmuebleScrapeado),
        ],
      };
    },
  );

  app.delete(
    "/perfil",
    {
      preValidation: authenticate,
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "1 hour",
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;

      const usuario = await prisma.usuario.findUnique({
        where: { id: userId },
        select: { email: true, eliminadoEn: true, eliminacionProgramadaEn: true },
      });

      if (!usuario) {
        return reply.status(204).send();
      }

      let programado = usuario.eliminacionProgramadaEn;

      if (usuario.eliminadoEn === null) {
        const eliminadoEn = new Date();
        programado = new Date(
          eliminadoEn.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_MS,
        );

        const recoveryUrl = `${FRONTEND_URL}/recuperar`;

        try {
          await sendAccountDeletionScheduledEmail(
            usuario.email,
            programado,
            recoveryUrl,
          );
        } catch (err) {
          console.error("Failed to send account deletion scheduled email:", err);
          return reply.status(502).send({
            success: false,
            error: "No se pudo enviar el aviso de eliminación. Intenta de nuevo.",
          });
        }

        const resultado = await prisma.usuario.updateMany({
          where: { id: userId, eliminadoEn: null },
          data: { eliminadoEn, eliminacionProgramadaEn: programado },
        });

        if (resultado.count !== 1) {
          return reply.status(204).send();
        }

        await clearAccountRecoveryData(userId, usuario.email);
      }

      return reply.status(200).send({
        success: true,
        eliminacionProgramadaEn: programado!.toISOString(),
      });
    },
  );
};
