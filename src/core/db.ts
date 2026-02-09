import Database from 'better-sqlite3';
import { Config } from '../config.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

let _db: Database.Database | null = null;

/**
 * Get the singleton database instance for the given config.
 * Creates the DB directory and schema if not already present.
 */
export function getDb(config: Config): Database.Database {
  if (_db) return _db;

  // Determine DB path: config.vault.path/.app-data/index.db
  const dbPath = join(config.vault.path, '.app-data', 'index.db');

  // Ensure the directory exists
  const dbDir = join(config.vault.path, '.app-data');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Open the database
  const db = new Database(dbPath);

  // Run pragmas
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // Create tables if they don't exist
  const createTablesSQL = `
    CREATE TABLE IF NOT EXISTS documents (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL CHECK (kind IN ('file', 'entry')),
      file_path     TEXT UNIQUE,
      file_hash     TEXT,
      file_type     TEXT,
      content       TEXT,
      title         TEXT,
      date          TEXT,
      metadata      TEXT,
      extracted_text TEXT,
      processed     INTEGER NOT NULL DEFAULT 0,
      error_msg     TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      aliases     TEXT DEFAULT '[]',
      metadata    TEXT DEFAULT '{}',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS relationships (
      id          TEXT PRIMARY KEY,
      source_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      target_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      properties  TEXT DEFAULT '{}',
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_entities (
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      mention     TEXT,
      confidence  REAL DEFAULT 1.0,
      PRIMARY KEY (document_id, entity_id)
    );

    CREATE INDEX IF NOT EXISTS idx_documents_kind ON documents(kind);
    CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
    CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
    CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
    CREATE INDEX IF NOT EXISTS idx_document_entities_doc ON document_entities(document_id);
    CREATE INDEX IF NOT EXISTS idx_document_entities_entity ON document_entities(entity_id);
  `;

  db.exec(createTablesSQL);

  // Create FTS5 tables (cannot use IF NOT EXISTS)
  const hasFts = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'"
  ).get();

  if (!hasFts) {
    db.exec(`
      CREATE VIRTUAL TABLE documents_fts USING fts5(
        title, extracted_text,
        content=documents, content_rowid=rowid
      );
      CREATE VIRTUAL TABLE entities_fts USING fts5(
        name, aliases,
        content=entities, content_rowid=rowid
      );
    `);
  }

  // Singleton pattern
  _db = db;
  return _db;
}