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

/**
 * Query logging is a development tool, and it was on in production.
 *
 * "query" prints every statement this server runs, parameters included, to
 * stdout — which on Render and on Vercel is a retained, searchable log stream
 * that anyone with dashboard access can read. Every OTP written, every email
 * looked up, every session row went through it. It is the same mistake as
 * printing a session token, at a larger volume.
 *
 * Warnings and errors stay: those are the lines someone actually needs when
 * this misbehaves at 2am, and they do not carry row data.
 */
const logLevels =
  process.env.NODE_ENV === "production"
    ? ["warn", "error"]
    : ["query", "info", "warn", "error"];

export const prisma = globalForPrisma.prisma || new PrismaClient({
  adapter,
  log: logLevels
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;