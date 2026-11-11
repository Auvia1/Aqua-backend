import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';

function loadEnv() {
  for (const name of ['.env', '.env.local', '../.env.local']) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx < 1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();

const url = process.env.DATABASE_URL ?? '';
if (!url || url.includes('[YOUR-PASSWORD]')) {
  console.error('Set DATABASE_URL in backend/.env');
  process.exit(1);
}

export const sql = postgres(url, {
  prepare: false,
  ssl: 'require',
  max: 8,
  onnotice: () => {},
  types: {
    numeric: {
      to: 1700,
      from: [1700],
      serialize: (value) => (value == null ? null : String(value)),
      parse: (value) => (value == null ? null : Number(value)),
    },
  },
});
