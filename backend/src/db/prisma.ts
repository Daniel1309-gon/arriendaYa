import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({
  connectionString,
  // You can add additional configuration options here if needed
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });