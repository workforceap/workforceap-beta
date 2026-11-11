/**
 * Shared Prisma-related env (used by prisma-env.js and next.config).
 * Ensures POSTGRES_* exist for schema validation and Prisma Client at build/runtime.
 */
const fs = require('fs');
const path = require('path');

// The local preview builds its env in-process and must never import a developer's .env.
if (process.env.LOCAL_PREVIEW !== '1') try {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()]) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    });
  }
} catch (_) {}

if (!process.env.POSTGRES_PRISMA_URL && process.env.DATABASE_URL) {
  process.env.POSTGRES_PRISMA_URL = process.env.DATABASE_URL;
}
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.DATABASE_URL) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.DATABASE_URL;
}
if (!process.env.POSTGRES_URL_NON_POOLING && process.env.POSTGRES_PRISMA_URL) {
  process.env.POSTGRES_URL_NON_POOLING = process.env.POSTGRES_PRISMA_URL;
}

if (!process.env.POSTGRES_PRISMA_URL) {
  const placeholder = 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder';
  process.env.POSTGRES_PRISMA_URL = placeholder;
  process.env.POSTGRES_URL_NON_POOLING = placeholder;
  process.env.__PRISMA_PLACEHOLDER_DB = '1';
}
