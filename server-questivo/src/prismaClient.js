// src/prismaClient.js
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

// Initialize PG Pool
const { Pool } = pg;
const pool = new Pool({ 
  connectionString, 
  ssl: { rejectUnauthorized: false } // Needed for most cloud DBs (Neon/Supabase)
});

// Initialize Adapter
const adapter = new PrismaPg(pool);

// Global instance to prevent connection exhaustion in development
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma || new PrismaClient({ 
  adapter,
  log: ["query", "info", "warn", "error"]
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;