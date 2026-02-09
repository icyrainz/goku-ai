import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

export interface DocumentRow {
  id: string;
  kind: string | null;
  file_path: string | null;
  file_hash: string | null;
  file_type: string | null;
  title: string | null;
  date: string | null;
  metadata: string | null;
  extracted_text: string | null;
  processed: number;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}

function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Insert a new document (file or entry) into the database.
 * Returns the document ID.
 */
export function createFileDocument(
  db: Database.Database,
  filePath: string,     // relative path
  fileHash: string,
  fileType: string,
  title: string,
  date: string | null,
  extractedText: string,
  metadata: Record<string, unknown>
): string  // returns document id
{
  const stmt = db.prepare(`
    INSERT INTO documents (id, kind, file_path, file_hash, file_type, title, date, metadata, extracted_text, processed, created_at, updated_at)
    VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  const result = stmt.run(
    nanoid(),
    filePath,
    fileHash,
    fileType,
    title,
    date,
    extractedText,
    JSON.stringify(metadata),
    now(),
    now()
  );
  return String(result.lastInsertRowid);
}

/**
 * Create a new entry document.
 * Returns the document ID.
 */
export function createEntry(
  db: Database.Database,
  content: string
): string  // returns document id
{
  const title = content.split('\n')[0] || 'Untitled';
  const truncatedTitle = title.length > 100 ? title.substring(0, 100) + '...' : title;
  const stmt = db.prepare(`
    INSERT INTO documents (id, kind, content, title, date, extracted_text, processed, created_at, updated_at)
    VALUES (?, 'entry', ?, ?, ?, ?, 0, ?, ?)
  `);
  const result = stmt.run(
    nanoid(),
    content,
    truncatedTitle,
    today(),
    content,
    now(),
    now()
  );
  return String(result.lastInsertRowid);
}

/**
 * Get a document by file path.
 * Returns undefined if not found.
 */
export function getDocumentByFilePath(
  db: Database.Database,
  filePath: string
): DocumentRow | undefined
{
  const row = db.prepare('SELECT * FROM documents WHERE file_path = ? AND kind = \'file\'').get(filePath);
  return row as DocumentRow | undefined;
}

/**
 * Get a document by ID.
 * Returns undefined if not found.
 */
export function getDocumentById(
  db: Database.Database,
  id: string
): DocumentRow | undefined
{
  return db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined;
}

/**
 * Get all pending documents (processed = 0).
 */
export function getPendingDocuments(
  db: Database.Database
): DocumentRow[] {
  return db.prepare('SELECT * FROM documents WHERE processed = 0').all() as DocumentRow[];
}

/**
 * Get all documents.
 */
export function getAllDocuments(
  db: Database.Database
): DocumentRow[] {
  return db.prepare('SELECT * FROM documents').all() as DocumentRow[];
}

/**
 * Update a file document with new hash, title, date, metadata, extracted text.
 * Also resets processed flag and clears error_msg.
 */
export function updateFileDocument(
  db: Database.Database,
  id: string,
  fileHash: string,
  title: string,
  date: string | null,
  extractedText: string,
  metadata: Record<string, unknown>
): void {
  db.prepare(`
    UPDATE documents SET 
      file_hash = ?, 
      title = ?, 
      date = ?, 
      metadata = ?, 
      extracted_text = ?, 
      processed = 0,
      error_msg = NULL,
      updated_at = ?
    WHERE id = ?
  `).run(fileHash, title, date, JSON.stringify(metadata), extractedText, now(), id);
}

/**
 * Mark a document as processed (1) or errored (2) with optional error message.
 */
export function markProcessed(
  db: Database.Database,
  id: string,
  status: 1 | 2,
  errorMsg?: string
): void {
  db.prepare('UPDATE documents SET processed = ?, error_msg = ? WHERE id = ?').run(status, errorMsg, id);
}

/**
 * Delete a document and its associations.
 */
export function deleteDocument(
  db: Database.Database,
  id: string
): void {
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
}

/**
 * Get counts of documents by processed status.
 */
export function getDocumentCounts(
  db: Database.Database
): { total: number; files: number; entries: number; processed: number; pending: number; errored: number } {
  const total = db.prepare('SELECT COUNT(*) as count FROM documents').get() as { count: number } | undefined;
  const files = db.prepare('SELECT COUNT(*) as count FROM documents WHERE kind = "file"').get() as { count: number } | undefined;
  const entries = db.prepare('SELECT COUNT(*) as count FROM documents WHERE kind = "entry"').get() as { count: number } | undefined;
  const processed = db.prepare('SELECT COUNT(*) as count FROM documents WHERE processed = 1').get() as { count: number } | undefined;
  const pending = db.prepare('SELECT COUNT(*) as count FROM documents WHERE processed = 0').get() as { count: number } | undefined;
  const errored = db.prepare('SELECT COUNT(*) as count FROM documents WHERE processed = 2').get() as { count: number } | undefined;
  return {
    total: total?.count ?? 0,
    files: files?.count ?? 0,
    entries: entries?.count ?? 0,
    processed: processed?.count ?? 0,
    pending: pending?.count ?? 0,
    errored: errored?.count ?? 0,
  };
}