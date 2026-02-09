import Database from 'better-sqlite3';
import Fuse from 'fuse.js';
import { nanoid } from 'nanoid';

function now(): string { return new Date().toISOString(); }

export interface EntityRow {
  id: string;
  name: string;
  type: string;
  aliases: string;  // JSON array string
  metadata: string; // JSON object string
  created_at: string;
  updated_at: string;
}

/**
 * Find an existing entity or create a new one.
 * Dedup strategy:
 *   1. Exact match on name (case-insensitive)
 *   2. Exact match on any alias
 *   3. Fuzzy match (Fuse.js, threshold 0.3) on same-type entities
 *   4. No match → create new
 *
 * Returns the entity ID (existing or newly created).
 */
export function findOrCreateEntity(
  db: Database.Database,
  name: string,
  type: string,
  mentions: string[] = []
): string {
  // 1. Exact name match (case-insensitive)
  const exact = db.prepare(
    'SELECT id, aliases FROM entities WHERE LOWER(name) = LOWER(?) AND type = ?'
  ).get(name, type) as { id: string; aliases: string } | undefined;

  if (exact) {
    addAliases(db, exact.id, mentions, exact.aliases);
    return exact.id;
  }

  // 2. Alias match — search all entities of same type
  const sameType = db.prepare(
    'SELECT id, name, aliases FROM entities WHERE type = ?'
  ).all(type) as { id: string; name: string; aliases: string }[];

  for (const entity of sameType) {
    const aliases: string[] = JSON.parse(entity.aliases || '[]');
    const allNames = [entity.name.toLowerCase(), ...aliases.map(a => a.toLowerCase())];
    if (allNames.includes(name.toLowerCase())) {
      addAliases(db, entity.id, [name, ...mentions], entity.aliases);
      return entity.id;
    }
  }

  // 3. Fuzzy match using Fuse.js
  if (sameType.length > 0) {
    const fuse = new Fuse(sameType, {
      keys: ['name'],
      threshold: 0.3,       // 0 = exact, 1 = anything. 0.3 is moderately strict.
      includeScore: true,
    });
    const results = fuse.search(name);
    if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.3) {
      const match = results[0].item;
      addAliases(db, match.id, [name, ...mentions], match.aliases);
      return match.id;
    }
  }

  // 4. No match — create new entity
  const id = nanoid();
  const aliases = JSON.stringify([...new Set(mentions.filter(m => m.toLowerCase() !== name.toLowerCase()))]);
  db.prepare(
    'INSERT INTO entities (id, name, type, aliases, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, type, aliases, '{}', now(), now());

  // Sync FTS
  db.prepare(
    'INSERT INTO entities_fts(rowid, name, aliases) SELECT rowid, name, aliases FROM entities WHERE id = ?'
  ).run(id);

  return id;
}

/** Add new aliases to an existing entity (dedup, max 50 aliases) */
function addAliases(db: Database.Database, entityId: string, newAliases: string[], currentAliasesJson: string): void {
  const current: string[] = JSON.parse(currentAliasesJson || '[]');
  const currentLower = new Set(current.map(a => a.toLowerCase()));
  const entity = db.prepare('SELECT name FROM entities WHERE id = ?').get(entityId) as { name: string };
  currentLower.add(entity.name.toLowerCase());

  let added = false;
  for (const alias of newAliases) {
    if (alias && !currentLower.has(alias.toLowerCase())) {
      current.push(alias);
      currentLower.add(alias.toLowerCase());
      added = true;
    }
  }

  if (added) {
    const trimmed = current.slice(0, 50); // Max 50 aliases
    db.prepare('UPDATE entities SET aliases = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(trimmed), now(), entityId);

    // Sync FTS
    db.prepare('DELETE FROM entities_fts WHERE rowid = (SELECT rowid FROM entities WHERE id = ?)').run(entityId);
    db.prepare('INSERT INTO entities_fts(rowid, name, aliases) SELECT rowid, name, aliases FROM entities WHERE id = ?').run(entityId);
  }
}

export function getAllEntities(db: Database.Database): { name: string; type: string }[] {
  return db.prepare('SELECT name, type FROM entities ORDER BY name').all() as { name: string; type: string }[];
}

export function getEntityByNameOrId(db: Database.Database, query: string): EntityRow | undefined {
  // Try exact ID
  const byId = db.prepare('SELECT * FROM entities WHERE id = ?').get(query) as EntityRow | undefined;
  if (byId) return byId;

  // Try exact name (case-insensitive)
  const byName = db.prepare('SELECT * FROM entities WHERE LOWER(name) = LOWER(?)').get(query) as EntityRow | undefined;
  if (byName) return byName;

  return undefined;
}

export function searchEntities(db: Database.Database, query: string): EntityRow[] {
  // FTS5 search
  const ftsResults = db.prepare(
    `SELECT e.* FROM entities e
     JOIN entities_fts f ON e.rowid = f.rowid
     WHERE entities_fts MATCH ?
     ORDER BY rank
     LIMIT 20`
  ).all(query) as EntityRow[];

  if (ftsResults.length > 0) return ftsResults;

  // Fallback: fuzzy search with Fuse.js
  const allEntities = db.prepare('SELECT * FROM entities').all() as EntityRow[];
  const fuse = new Fuse(allEntities, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
  });
  return fuse.search(query).slice(0, 20).map(r => r.item);
}

export function getRelatedEntities(db: Database.Database, entityId: string) {
  const outgoing = db.prepare(`
    SELECT e.*, r.type as rel_type FROM entities e
    JOIN relationships r ON e.id = r.target_id
    WHERE r.source_id = ?
  `).all(entityId) as (EntityRow & { rel_type: string })[];

  const incoming = db.prepare(`
    SELECT e.*, r.type as rel_type FROM entities e
    JOIN relationships r ON e.id = r.source_id
    WHERE r.target_id = ?
  `).all(entityId) as (EntityRow & { rel_type: string })[];

  return [
    ...outgoing.map(e => ({ entity: e, relationshipType: e.rel_type, direction: 'outgoing' as const })),
    ...incoming.map(e => ({ entity: e, relationshipType: e.rel_type, direction: 'incoming' as const })),
  ];
}

export function getDocumentsForEntity(db: Database.Database, entityId: string) {
  return db.prepare(`
    SELECT d.id as document_id, de.mention, d.kind, d.file_path, d.title, d.date,
           COALESCE(d.content, d.extracted_text) as content
    FROM documents d
    JOIN document_entities de ON d.id = de.document_id
    WHERE de.entity_id = ?
    ORDER BY d.date DESC
  `).all(entityId) as any[];
}

export function searchDocumentEntities(db: Database.Database, query: string): EntityRow[] {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT e.* FROM entities e
      JOIN document_entities de ON e.id = de.entity_id
      JOIN documents d ON d.id = de.document_id
      JOIN documents_fts f ON d.rowid = f.rowid
      WHERE documents_fts MATCH ?
      LIMIT 20
    `).all(query) as EntityRow[];
    return rows;
  } catch {
    // FTS5 can throw on special characters or malformed queries
    return [];
  }
}

export function getEntityCounts(db: Database.Database): { type: string; count: number }[] {
  return db.prepare('SELECT type, COUNT(*) as count FROM entities GROUP BY type ORDER BY count DESC').all() as any[];
}