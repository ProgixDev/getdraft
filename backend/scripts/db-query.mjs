#!/usr/bin/env node
//
// Run a read-only SQL file against a Postgres URL and print the rows as JSON.
//
//   node backend/scripts/db-query.mjs <url-file> <query.sql>
//
// Why this exists alongside scripts/apply-migrations.sh: `prisma db execute`
// explicitly does not return data ("only to report success or failure"), so
// it can apply DDL but cannot introspect. This uses $queryRawUnsafe, which
// does return rows.
//
// Lives under backend/ so that `import '@prisma/client'` resolves --
// Node walks up from the FILE's directory, and the client is installed in
// backend/node_modules, not at the repo root.
//
// The connection URL is read from a gitignored file rather than argv, so it
// stays out of `ps`, shell history and chat transcripts.

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const [urlFile, sqlFile] = process.argv.slice(2);
if (!urlFile || !sqlFile) {
  console.error('usage: node db-query.mjs <url-file> <query.sql>');
  process.exit(2);
}

const url = readFileSync(urlFile, 'utf8').trim();
const sql = readFileSync(sqlFile, 'utf8');

if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error(`not a postgres URL: ${urlFile}`);
  process.exit(1);
}

// Say which host we hit, without leaking user or password. Reading the wrong
// project is how you draw confident conclusions about the wrong database.
console.error(`# host: ${url.split('@').pop().split(/[/?]/)[0]}`);

const prisma = new PrismaClient({ datasourceUrl: url });

try {
  const rows = await prisma.$queryRawUnsafe(sql);
  // Postgres count()/oid come back as BigInt, which JSON.stringify refuses.
  console.log(
    JSON.stringify(rows, (_k, v) => (typeof v === 'bigint' ? Number(v) : v), 2),
  );
} catch (err) {
  console.error(
    String(err?.message ?? err).replace(
      /postgres(ql)?:\/\/\S+/g,
      'postgresql://<redacted>',
    ),
  );
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
