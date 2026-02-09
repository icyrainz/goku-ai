import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

function now(): string { return new Date().toISOString(); }

export function findOrCreateRelationship(
  db: Database.Database,
  sourceId: string,
  targetId: string,
  type: string,
  properties?: Record<string, unknown>
): string {
  const existing = db.prepare(
    'SELECT id FROM relationships WHERE source_id = ? AND target_id = ? AND type = ?'
  ).get(sourceId, targetId, type) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = nanoid();
  db.prepare(
    'INSERT INTO relationships (id, source_id, target_id, type, properties, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, sourceId, targetId, type, JSON.stringify(properties || {}), now());

  return id;
}

export function getRelationshipsForEntity(
  db: Database.Database,
  entityId: string
): { id: string; source_id: string; target_id: string; type: string; properties: string }[] {
  return db.prepare(
    'SELECT * FROM relationships WHERE source_id = ? OR target_id = ?'
  ).all(entityId, entityId) as any[];
}

export function getRelationshipCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM relationships').get() as { count: number };
  return row.count;
}