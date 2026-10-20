import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// One client per server process. In development hot reloading re-runs this
// module, so the client is kept on globalThis to avoid opening a new
// connection pool on every edit. Created on first use so that building the app
// does not need a database.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function db(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set (copy .env.example to .env).");
    }
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
  }
  return globalForPrisma.prisma;
}
