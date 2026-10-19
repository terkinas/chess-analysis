import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Server-only: import this from route handlers, never from a client component.
// The client is created on first use (so a missing DATABASE_URL fails one
// request rather than the whole app) and kept on globalThis so dev-mode hot
// reloads reuse one connection pool instead of opening a new one each time.

const globalForPrisma = globalThis as unknown as {
  gambitPrisma?: PrismaClient;
};

export function getPrisma(): PrismaClient {
  if (globalForPrisma.gambitPrisma) return globalForPrisma.gambitPrisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  globalForPrisma.gambitPrisma = client;
  return client;
}

/** True for Prisma's "unique constraint failed" error (P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
