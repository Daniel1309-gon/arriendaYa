import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import 'dotenv/config';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';

import { prisma } from './db/prisma';
import { connectToMongo } from './db/mongo';
import { redisClient } from './db/redis';

import { authRoutes } from './modules/auth/auth.routes';
import { usuariosRoutes } from './modules/usuarios/usuarios.routes';
import { inmueblesRoutes } from './modules/inmuebles/inmuebles.routes';
import { startDeletedAccountsPurgeJob } from './jobs/purge-deleted-accounts';
import {
    MAX_BYTES_POR_IMAGEN,
    MAX_IMAGENES_POR_INMUEBLE,
} from './modules/inmuebles/imagenes.service';

const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
});
app.register(jwt, {
    secret: process.env.JWT_SECRET!
});

app.register(rateLimit, {
    max: 50,
    timeWindow: "1 minute",
});

// Fotos de los inmuebles propios (POST /inmuebles/:id/imagenes). Los límites
// van acá y no en la ruta para que el body se corte en el stream y los límites
// se conviertan en errores 413 antes de procesar el contenido.
app.register(multipart, {
    throwFileSizeLimit: true,
    limits: {
        fileSize: MAX_BYTES_POR_IMAGEN,
        files: MAX_IMAGENES_POR_INMUEBLE,
        fields: 0,
        parts: MAX_IMAGENES_POR_INMUEBLE,
        fieldNameSize: 64,
        headerPairs: 20,
    },
});

app.get('/health', async (request, reply) => {
    return { status: 'ok' , message: 'Server is running' }
});


app.register(authRoutes, { prefix: '/auth' });
app.register(usuariosRoutes, { prefix: '/usuarios' });
app.register(inmueblesRoutes, { prefix: '/inmuebles' });


const start = async() => {
    try {
        await connectToMongo();

        const configuredPurgeInterval = Number(
            process.env.DELETED_ACCOUNTS_PURGE_INTERVAL_MS,
        );
        const purgeInterval = Number.isFinite(configuredPurgeInterval) && configuredPurgeInterval > 0
            ? configuredPurgeInterval
            : undefined;
        const stopDeletedAccountsPurgeJob = startDeletedAccountsPurgeJob(
            (error) => app.log.error(error, 'Deleted account purge failed'),
            purgeInterval,
        );

        app.addHook('onClose', async () => {
            stopDeletedAccountsPurgeJob();
        });

        const port = parseInt(process.env.PORT || '3000');
        await app.listen({ port: port, host: '0.0.0.0' });

        console.log(`Server is running on port ${port}`);
        
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();
