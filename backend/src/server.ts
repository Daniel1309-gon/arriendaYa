import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import 'dotenv/config';
import rateLimit from '@fastify/rate-limit';

import { prisma } from './db/prisma';
import { connectToMongo } from './db/mongo';
import { redisClient } from './db/redis';

import { authRoutes } from './modules/auth/auth.routes';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes';

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(cors, {
    origin: true
});
app.register(jwt, {
    secret: process.env.JWT_SECRET!
});

app.register(rateLimit, {
    max: 50,
    timeWindow: "1 minute",
});

app.get('/health', async (request, reply) => {
    return { status: 'ok' , message: 'Server is running' }
});

app.register(authRoutes, { prefix: '/auth' });
app.register(usuariosRoutes, { prefix: '/usuarios' });
const start = async() => {
    try {
        await connectToMongo();
        const port = parseInt(process.env.PORT || '3000');
        await app.listen({ port: port, host: '0.0.0.0' });

        console.log(`Server is running on port ${port}`);
        
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();