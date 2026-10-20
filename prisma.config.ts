import { defineConfig } from "prisma/config";

// The Prisma CLI does not read .env by itself; Next.js does at runtime.
try {
  process.loadEnvFile();
} catch {
  // No .env file: DATABASE_URL may come from the real environment instead.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // `prisma generate` runs on install, before any database is configured, so
    // a missing URL must not fail it; commands that connect will still fail.
    url: process.env.DATABASE_URL ?? "postgresql://invalid:invalid@localhost:5432/invalid",
  },
});
