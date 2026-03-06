import Database from "better-sqlite3";
import { config } from "../config/index.js";
import { mkdirSync } from "fs";
import { join, dirname } from "path";

type SqliteDb = InstanceType<typeof Database>;

function createDbConnection(): SqliteDb {
  try {
    // Ensure the directory exists
    const dbPath = join(process.cwd(), config.CHAT_STATE_FILE);
    const dbDir = dirname(dbPath);
    
    try {
      mkdirSync(dbDir, { recursive: true });
    } catch (err) {
      // Directory might already exist, that's fine
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
        throw new Error(
          `Failed to create database directory '${dbDir}': ${(err as Error).message}`
        );
      }
    }

    // Create database connection
    const db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    const result = db.pragma("journal_mode = WAL", { simple: true });
    if (result !== "wal") {
      throw new Error(
        `Failed to enable WAL mode. Got: ${result}`
      );
    }

    return db;
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(`Database connection failed: ${err.message}`);
    }
    throw new Error("Database connection failed: Unknown error");
  }
}

export const db: SqliteDb = createDbConnection();
