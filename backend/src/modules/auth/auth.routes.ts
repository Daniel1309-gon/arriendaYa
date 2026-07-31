import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { redisClient } from "../../db/redis";
import { prisma } from "../../db/prisma";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";
import {
  ACCOUNT_RECOVERY_TOKEN_TTL_SECONDS,
  createAccountRecoveryToken,
  consumeAccountRecoveryToken,
  getAccountRecoveryUserId,
  normalizeEmail,
  recoveryOtpKey,
} from "./account-recovery";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const RequestOTPSchema = z.object({
  email: z.email("Invalid email address"),
});

const VerifyOTPSchema = z.object({
  email: z.email("Invalid email address"),
  codigo: z.string().length(6, "OTP must be 6 digits"),
});

const GoogleLoginSchema = z.object({
  idToken: z.string("ID Token is required"),
});

const AccountRecoveryEmailSchema = z.object({
  email: z.email("Invalid email address"),
});

const AccountRecoveryVerifySchema = z.object({
  email: z.email("Invalid email address"),
  codigo: z.string().length(6, "OTP must be 6 digits"),
});

const AccountRecoveryConfirmSchema = z.object({
  recoveryToken: z
    .string()
    .min(1, "Recovery token is required")
    .max(128, "Recovery token is too long"),
});

const ACCOUNT_RECOVERY_OTP_TTL_SECONDS = 5 * 60;

function isRecoverableAccount(
  usuario: {
    eliminadoEn: Date | null;
    eliminacionProgramadaEn: Date | null;
  } | null,
  now = new Date(),
) {
  return Boolean(
    usuario?.eliminadoEn &&
      usuario.eliminacionProgramadaEn &&
      usuario.eliminacionProgramadaEn > now,
  );
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/otp/request",
    {
      schema: {
        body: RequestOTPSchema,
      },
      config: {
        rateLimit: {
          max: 5, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      // Generate a random OTP (for example, a 6-digit number)
      const codigo = crypto.randomInt(100000, 1000000).toString();
      // Store OTP in Redis with a short expiration time
      await redisClient.setex(`otp:${email}`, 300, codigo); // 5 minutes expiration

      console.log(`OTP for ${email}: ${codigo}`); // For testing purposes, log the OTP to the console
      return { success: true, message: "OTP sent successfully" };
    },
  );

  app.post(
    "/otp/verify",
    {
      schema: {
        body: VerifyOTPSchema,
      },
      config: {
        rateLimit: {
          max: 5, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const { codigo } = request.body;
      // Retrieve the stored OTP from Redis
      const storedOtp = await redisClient.get(`otp:${email}`);
      if (!storedOtp || storedOtp !== codigo) {
        return reply
          .status(401)
          .send({ success: false, error: "Invalid or expired OTP" });
      }

      // Delete the used OTP from Redis
      await redisClient.del(`otp:${email}`);

      const usuarioExistente = await prisma.usuario.findUnique({
        where: { email },
      });

      if (usuarioExistente?.eliminadoEn) {
        return reply.status(403).send({
          success: false,
          error: "This account has been deleted",
        });
      }

      const usuario =
        usuarioExistente ??
        (await prisma.usuario.create({
          data: { email },
        }));

      const token = app.jwt.sign(
        { id: usuario.id, email: usuario.email },
        { expiresIn: "1d" },
      );

      return { success: true, token, usuario };
    },
  );

  // This endpoint intentionally does not reveal whether an email belongs to
  // a recoverable account. It only sends a recovery code when the account is
  // inside the 14-day grace period.
  app.post(
    "/cuenta/recuperar",
    {
      schema: { body: AccountRecoveryEmailSchema },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "5 minute",
        },
      },
    },
    async (request) => {
      const email = normalizeEmail(request.body.email);
      const usuario = await prisma.usuario.findUnique({
        where: { email },
        select: { eliminadoEn: true, eliminacionProgramadaEn: true },
      });

      if (isRecoverableAccount(usuario)) {
        const codigo = crypto.randomInt(100000, 1000000).toString();
        await redisClient.setex(
          recoveryOtpKey(email),
          ACCOUNT_RECOVERY_OTP_TTL_SECONDS,
          codigo,
        );

        // Email delivery is mocked in this project. Replace this log with the
        // email provider integration when it is available.
        console.log(`Account recovery OTP for ${email}: ${codigo}`);
      }

      return {
        success: true,
        message:
          "Si la cuenta puede recuperarse, recibirás un código de recuperación.",
      };
    },
  );

  app.post(
    "/cuenta/recuperar/verificar",
    {
      schema: { body: AccountRecoveryVerifySchema },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "5 minute",
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const { codigo } = request.body;
      const storedOtp = await redisClient.get(recoveryOtpKey(email));

      if (!storedOtp || storedOtp !== codigo) {
        return reply
          .status(401)
          .send({ success: false, error: "Código inválido o expirado" });
      }

      await redisClient.del(recoveryOtpKey(email));

      const usuario = await prisma.usuario.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          eliminadoEn: true,
          eliminacionProgramadaEn: true,
        },
      });

      if (!usuario || !isRecoverableAccount(usuario)) {
        return reply.status(410).send({
          success: false,
          error: "La cuenta ya no puede recuperarse",
        });
      }

      const recoveryToken = await createAccountRecoveryToken(usuario.id);

      return {
        success: true,
        recoveryToken,
        expiresIn: ACCOUNT_RECOVERY_TOKEN_TTL_SECONDS,
      };
    },
  );

  app.post(
    "/cuenta/recuperar/google",
    {
      schema: { body: GoogleLoginSchema },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "5 minute",
        },
      },
    },
    async (request, reply) => {
      const { idToken } = request.body;

      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        if (!payload || !payload.email || payload.email_verified !== true) {
          return reply
            .status(401)
            .send({ success: false, error: "Invalid ID Token" });
        }

        const email = normalizeEmail(payload.email);
        const usuario = await prisma.usuario.findUnique({
          where: { email },
          select: {
            id: true,
            eliminadoEn: true,
            eliminacionProgramadaEn: true,
          },
        });

        if (!usuario || !isRecoverableAccount(usuario)) {
          return reply.status(410).send({
            success: false,
            error: "La cuenta ya no puede recuperarse",
          });
        }

        const recoveryToken = await createAccountRecoveryToken(usuario.id);

        return {
          success: true,
          recoveryToken,
          expiresIn: ACCOUNT_RECOVERY_TOKEN_TTL_SECONDS,
        };
      } catch (error) {
        console.error("Error verifying recovery Google ID Token:", error);
        return reply
          .status(401)
          .send({ success: false, error: "Failed to verify Google ID Token" });
      }
    },
  );

  app.post(
    "/cuenta/recuperar/confirmar",
    {
      schema: { body: AccountRecoveryConfirmSchema },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "5 minute",
        },
      },
    },
    async (request, reply) => {
      const { recoveryToken } = request.body;
      const userId = await getAccountRecoveryUserId(recoveryToken);

      if (!userId) {
        return reply.status(401).send({
          success: false,
          error: "Token de recuperación inválido o expirado",
        });
      }

      const now = new Date();
      const restaurado = await prisma.usuario.updateMany({
        where: {
          id: userId,
          eliminadoEn: { not: null },
          eliminacionProgramadaEn: { gt: now },
        },
        data: {
          eliminadoEn: null,
          eliminacionProgramadaEn: null,
        },
      });

      await consumeAccountRecoveryToken(userId, recoveryToken);

      if (restaurado.count !== 1) {
        return reply.status(410).send({
          success: false,
          error: "La cuenta ya no puede recuperarse",
        });
      }

      const usuario = await prisma.usuario.findUnique({
        where: { id: userId },
      });

      if (!usuario) {
        return reply.status(410).send({
          success: false,
          error: "La cuenta ya no puede recuperarse",
        });
      }

      const token = app.jwt.sign(
        { id: usuario.id, email: usuario.email },
        { expiresIn: "1d" },
      );

      return {
        success: true,
        token,
        usuario,
        message: "Cuenta reactivada correctamente",
      };
    },
  );

  app.post(
    "/google",
    {
      schema: {
        body: GoogleLoginSchema,
      },
      config: {
        rateLimit: {
          max: 5, // Maximum number of requests
          timeWindow: "5 minute", // Time window for the rate limit
        },
      },
    },
    async (request, reply) => {
      const { idToken } = request.body;

      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();

        if (!payload || !payload.email || payload.email_verified !== true) {
          return reply
            .status(401)
            .send({ success: false, error: "Invalid ID Token" });
        }

        const email = normalizeEmail(payload.email);
        const usuarioExistente = await prisma.usuario.findUnique({
          where: { email },
        });

        if (usuarioExistente?.eliminadoEn) {
          return reply.status(403).send({
            success: false,
            error: "This account has been deleted",
          });
        }

        const usuario = usuarioExistente
          ? await prisma.usuario.update({
              where: { id: usuarioExistente.id },
              data: { googleId: payload.sub },
            })
          : await prisma.usuario.create({
              data: { email, googleId: payload.sub },
            });

        const token = app.jwt.sign(
          { id: usuario.id, email: usuario.email },
          { expiresIn: "1d" },
        );

        return { success: true, token, usuario };
      } catch (error) {
        console.error("Error verifying Google ID Token:", error);
        return reply
          .status(401)
          .send({ success: false, error: "Failed to verify Google ID Token" });
      }
    },
  );
};
