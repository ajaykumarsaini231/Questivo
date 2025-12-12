// src/prismaClient.js
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

// Fix __dirname for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env during local dev (Vercel should use env vars from dashboard)
dotenv.config({ path: path.join(__dirname, "../.env") });

// A helper that tries to load a package as CommonJS (require) first,
// then falls back to dynamic import() for ESM packages.
const requireOrImport = async (pkgName) => {
  const requireFn = createRequire(import.meta.url);
  try {
    // Try CommonJS require
    const mod = requireFn(pkgName);
    return mod;
  } catch (requireErr) {
    // If require failed, try dynamic import (ESM)
    try {
      const imported = await import(pkgName);
      // Node's dynamic import wraps CommonJS default export under `.default`
      return imported;
    } catch (importErr) {
      // Both failed
      throw new Error(
        `Failed to load package "${pkgName}" via require and import.\nrequire error: ${requireErr.message}\nimport error: ${importErr.message}`
      );
    }
  }
};

let PrismaClient;
let Pool;
let PrismaPg;

// Load @prisma/client
try {
  const prismaPkg = await requireOrImport("@prisma/client");
  // prismaPkg may be { PrismaClient: ... } or { default: { PrismaClient: ... } }
  PrismaClient = prismaPkg.PrismaClient || (prismaPkg.default && prismaPkg.default.PrismaClient) || prismaPkg.default || prismaPkg;
  // If we accidentally got the module object, try to destructure
  if (PrismaClient && typeof PrismaClient !== "function") {
    // attempt more precise extraction
    PrismaClient = prismaPkg.PrismaClient || (prismaPkg.default && prismaPkg.default.PrismaClient);
  }
  if (!PrismaClient || typeof PrismaClient !== "function") {
    throw new Error("Unable to find PrismaClient constructor in @prisma/client exports.");
  }
  console.log("Loaded @prisma/client successfully.");
} catch (err) {
  console.error("Error loading @prisma/client:", err);
  throw err;
}

// Load pg Pool
try {
  const pgPkg = await requireOrImport("pg");
  Pool = pgPkg.Pool || (pgPkg.default && pgPkg.default.Pool) || pgPkg.default?.Pool || pgPkg;
  if (!Pool) {
    throw new Error("Unable to find Pool export from 'pg' package.");
  }
  console.log("Loaded pg Pool successfully.");
} catch (err) {
  console.error("Error loading pg:", err);
  throw err;
}

// Try to load PrismaPg adapter; if it fails or does not provide PrismaPg, we'll fall back.
let usingAdapter = false;
try {
  const adapterPkg = await requireOrImport("@prisma/adapter-pg");
  // adapterPkg might export PrismaPg as a named export, or default containing PrismaPg, or be the constructor itself.
  PrismaPg =
    adapterPkg.PrismaPg ||
    (adapterPkg.default && adapterPkg.default.PrismaPg) ||
    adapterPkg.default ||
    adapterPkg;

  // If it's an object with constructor property name, try to detect
  if (PrismaPg && (PrismaPg.name === "PrismaPg" || typeof PrismaPg === "function")) {
    usingAdapter = true;
    console.log("Loaded @prisma/adapter-pg as adapter (usingAdapter = true).");
  } else {
    // couldn't detect, don't use adapter
    console.warn("Loaded @prisma/adapter-pg but couldn't detect PrismaPg constructor — falling back to no-adapter.");
    PrismaPg = null;
  }
} catch (err) {
  // adapter missing or incompatible — not fatal, we'll fallback to plain PrismaClient
  console.warn("@prisma/adapter-pg load failed — falling back to plain PrismaClient. Error:", err.message);
  PrismaPg = null;
  usingAdapter = false;
}

// Ensure DATABASE_URL is present
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set in environment variables");
}

// If adapter loaded, create a Pool and adapter instance
let prismaClientOptions = { log: ["query", "info", "warn", "error"] };

if (PrismaPg) {
  try {
    const pool = new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    const adapterInstance = new PrismaPg(pool);
    prismaClientOptions.adapter = adapterInstance;
    console.log("Using PrismaPg adapter with a pg Pool.");
  } catch (err) {
    console.warn("Failed to initialize PrismaPg adapter or Pool — falling back to plain PrismaClient. Error:", err.message);
    // Remove adapter option to fallback
    delete prismaClientOptions.adapter;
    usingAdapter = false;
  }
} else {
  console.log("Not using PrismaPg adapter; will instantiate PrismaClient with DATABASE_URL directly.");
}

// Create Prisma client (single global in dev to avoid connection exhaustion)
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient(prismaClientOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

console.log(`Prisma client created. adapterUsed=${usingAdapter}`);

export default prisma;
