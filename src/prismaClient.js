// src/prismaClient.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env during local dev (Vercel should use env vars from dashboard)
dotenv.config({ path: path.join(__dirname, "../.env") });

// Import CommonJS-style packages via default import then destructure
import prismaPkg from "@prisma/client";
const { PrismaClient } = prismaPkg;

import pgPkg from "pg";
const { Pool } = pgPkg;

import adapterPkg from "@prisma/adapter-pg";
const { PrismaPg } = adapterPkg;

// Ensure DATABASE_URL exists
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

// Create a persistent pool suitable for re-use in serverless
const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false,
  },
});

const adapter = new PrismaPg(pool);

const prismaClientOptions = {
  adapter,
  log: ["query", "info", "warn", "error"],
};

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient(prismaClientOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
