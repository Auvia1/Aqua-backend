import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from './db.js';

const schema = readFileSync(resolve(process.cwd(), 'schema.sql'), 'utf8');

try {
  await sql.unsafe(schema);
  console.log('Schema applied.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
