import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../db/prisma";
import { authenticate } from "../../plugins/authenticate";

const UpdatePerfilSchema = z.object({
  zonasInteres: z.array(z.string()).optional(),
  edad: z.number().int().optional(),
  ciudadOrigen: z.string().optional(),
  telefono: z.string().optional(),
  presupuestoMin: z.number().int().optional(),
  presupuestoMax: z.number().int().optional(),
});

export const usuariosRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/perfil",
    {
      preValidation: authenticate,
      config: {
        rateLimit: {
          max: 5, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
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
          max: 5, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const userId = request.user.id;
      const dataToUpdate = request.body;

      const perfilActualizado = await prisma.usuario.update({
        where: { id: userId },
        data: dataToUpdate,
      });

      return { success: true, perfil: perfilActualizado };
    },
  );
};
