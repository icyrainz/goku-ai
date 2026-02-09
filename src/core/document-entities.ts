import Database from 'better-sqlite3';

/**
 * Link a document to an entity. Ignores duplicates (UPSERT).
 */
export function linkDocumentEntity(
  db: Database.Database,
  documentId: string,
  entityId: string,
  mention: string | null = null,
  confidence: number = 1.0
): void {
  db.prepare(
    `INSERT INTO document_entities (document_id, entity_id, mention, confidence)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (document_id, entity_id) DO UPDATE SET
      mention = COALESCE(excluded.mention, document_entities.mention),
      confidence = excluded.confidence`
  ).run(documentId, entityId, mention, confidence);
}

/**
 * Remove all entity links for a document.
 */
export function clearDocumentEntities(db: Database.Database, documentId: string): void {
  db.prepare('DELETE FROM document_entities WHERE document_id = ?').run(documentId);
}