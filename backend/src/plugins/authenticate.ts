import { FastifyReply, FastifyRequest } from "fastify";

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
      .send({ error: err, message: "Unauthorized. Invalid or missing token" });
  }
}
