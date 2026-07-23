import { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db/prisma";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string; email: string }; // payload type is used for signing and verifying
    user: { id: string; email: string }; // user type is used for request.user
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply
      .status(401)
      .send({ message: "Unauthorized. Invalid or missing token" });
  }

  // JWT is stateless, so verifying only its signature would leave a deleted
  // account usable until the token expires. Check the account on every request
  // to make the soft delete effective immediately.
  const usuario = await prisma.usuario.findUnique({
    where: { id: request.user.id },
    select: { id: true, eliminadoEn: true },
  });

  if (!usuario || usuario.eliminadoEn !== null) {
    return reply
      .status(401)
      .send({ message: "Unauthorized. Account is inactive" });
  }
}
