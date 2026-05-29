const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL not set. Set it in .env before running migrations.');
  process.exit(1);
}

async function run() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log('Running migration:', file);
      await client.query(sql);
    }
    console.log('Migrations completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
