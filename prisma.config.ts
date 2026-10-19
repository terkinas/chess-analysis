import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 reads the connection URL from here rather than from schema.prisma,
// and does not load .env by itself (hence the dotenv import above).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
