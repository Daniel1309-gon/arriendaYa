import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { redisClient } from "../../db/redis";
import { prisma } from "../../db/prisma";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";

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
      const { email } = request.body;
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
      const { email, codigo } = request.body;
      // Retrieve the stored OTP from Redis
      const storedOtp = await redisClient.get(`otp:${email}`);
      if (!storedOtp || storedOtp !== codigo) {
        return reply
          .status(401)
          .send({ success: false, error: "Invalid or expired OTP" });
      }

      // Delete the used OTP from Redis
      await redisClient.del(`otp:${email}`);

      const usuario = await prisma.usuario.upsert({
        where: { email },
        update: {},
        create: { email },
      });

      const token = app.jwt.sign(
        { id: usuario.id, email: usuario.email },
        { expiresIn: "1d" },
      );

      return { success: true, token, usuario };
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

        const usuario = await prisma.usuario.upsert({
          where: { email: payload.email },
          update: { googleId: payload.sub },
          create: { email: payload.email, googleId: payload.sub },
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
