import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";

loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH =
  process.env.DB_PATH ||
  process.env.CHAT_STATE_FILE ||
  ".data/chat-state.db";
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function migrate(): Promise<void> {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const migrationFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    const appliedMigrations = db
      .prepare("SELECT id FROM migrations")
      .all() as { id: string }[];
    const appliedIds = new Set(appliedMigrations.map((m) => m.id));

    for (const file of migrationFiles) {
      const migrationId = path.basename(file, ".sql");

      if (appliedIds.has(migrationId)) {
        console.log(`Skipping ${migrationId} (already applied)`);
        continue;
      }

      console.log(`Applying ${migrationId}...`);
      
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      db.exec(sql);

      db.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)").run(
        migrationId,
        Date.now()
      );

      console.log(`Applied ${migrationId}`);
    }

    console.log("Migrations complete");
  } finally {
    db.close();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
