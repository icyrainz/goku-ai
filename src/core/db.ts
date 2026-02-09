import Database from 'better-sqlite3';
import { Config } from '../config.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

let _db: Database.Database | null = null;

function columnExists(db: Database.Database, table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some(c => c.name === column);
}

function tableExists(db: Database.Database, name: string): boolean {
  return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
}

function migrateDocumentsTable(db: Database.Database): void {
  if (!tableExists(db, 'documents')) return;

  if (!columnExists(db, 'documents', 'kind')) {
    db.exec("ALTER TABLE documents ADD COLUMN kind TEXT NOT NULL DEFAULT 'file'");
  }
  if (!columnExists(db, 'documents', 'content')) {
    db.exec("ALTER TABLE documents ADD COLUMN content TEXT");
  }
}

export function getDb(config: Config): Database.Database {
  if (_db) return _db;

  const dbDir = join(config.vault.path, '.app-data');
  const dbPath = join(dbDir, 'index.db');

  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  migrateDocumentsTable(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id            TEXT PRIMARY KEY,
      kind          TEXT NOT NULL DEFAULT 'file',
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
  `);

  if (!tableExists(db, 'documents_fts')) {
    db.exec(`
      CREATE VIRTUAL TABLE documents_fts USING fts5(
        title, extracted_text,
        content=documents, content_rowid=rowid
      );
    `);
  }

  if (!tableExists(db, 'entities_fts')) {
    db.exec(`
      CREATE VIRTUAL TABLE entities_fts USING fts5(
        name, aliases,
        content=entities, content_rowid=rowid
      );
    `);
  }

  _db = db;
  return _db;
}