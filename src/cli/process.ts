import { Command } from 'commander';
import type { Config } from '../config.js';
import type Database from 'better-sqlite3';
import { getPendingDocuments, markProcessed, getAllDocuments } from '../core/documents.js';
import { extractEntities } from '../llm/extract.js';
import { extractRelationships } from '../llm/relate.js';
import { findOrCreateEntity, getAllEntities } from '../core/entities.js';
import { linkDocumentEntity, clearDocumentEntities } from '../core/document-entities.js';
import { findOrCreateRelationship } from '../core/relationships.js';

async function processDocument(
  config: Config,
  db: Database.Database,
  doc: any,
  existingEntities: { name: string; type: string }[]
): Promise<{ entities: number; relationships: number }> {
  const text = doc.extracted_text || '';

  if (text.trim().length < 10) {
    markProcessed(db, doc.id, 2, 'Content too short for extraction');
    return { entities: 0, relationships: 0 };
  }

  // Truncate very large text (rough ~8K token limit ≈ 32K chars)
  const truncatedText = text.length > 32000 ? text.slice(0, 32000) + '\n\n[TRUNCATED]' : text;

  // Step 1: Extract entities
  const rawEntities = await extractEntities(config, truncatedText, existingEntities);

  // Step 2: Dedup and store entities, link to document
  const resolvedEntities: { name: string; type: string; id: string }[] = [];
  for (const entity of rawEntities) {
    const entityId = findOrCreateEntity(db, entity.name, entity.type, entity.mentions);
    linkDocumentEntity(db, doc.id, entityId, entity.mentions[0] || null);
    resolvedEntities.push({ name: entity.name, type: entity.type, id: entityId });
  }

  // Step 3: Extract relationships
  let relCount = 0;
  if (resolvedEntities.length >= 2) {
    const rawRels = await extractRelationships(config, truncatedText, resolvedEntities);
    for (const rel of rawRels) {
      // Resolve entity names to IDs
      const sourceEntity = resolvedEntities.find(
        e => e.name.toLowerCase() === rel.source.toLowerCase()
      );
      const targetEntity = resolvedEntities.find(
        e => e.name.toLowerCase() === rel.target.toLowerCase()
      );
      if (sourceEntity && targetEntity) {
        findOrCreateRelationship(db, sourceEntity.id, targetEntity.id, rel.type);
        relCount++;
      }
    }
  }

  markProcessed(db, doc.id, 1);
  return { entities: resolvedEntities.length, relationships: relCount };
}

export const processCommand = new Command('process')
  .description('Run LLM extraction on pending documents')
  .option('--relink', 'Reprocess ALL documents with current entity knowledge')
  .option('--concurrency <n>', 'Number of concurrent LLM calls', '1')
  .action(async (options) => {
    const { loadConfig } = await import('../config.js');
    const { getDb } = await import('../core/db.js');
    const config = loadConfig();
    const db = getDb(config);

    // If --relink, reset all documents to pending and clear their entity links
    if (options.relink) {
      db.exec("UPDATE documents SET processed = 0, error_msg = NULL");
      db.exec("DELETE FROM document_entities");
      console.log('Reset all documents for relinking...');
    }

    const pending = getPendingDocuments(db);
    if (pending.length === 0) {
      console.log('No pending documents. Nothing to process.');
      return;
    }

    console.log(`Processing ${pending.length} documents...\n`);
    const startTime = Date.now();
    let processedCount = 0;

    for (const doc of pending) {
      const existingEntities = getAllEntities(db);
      const label = doc.file_path || doc.title || doc.id;

      try {
        const result = await processDocument(config, db, doc, existingEntities);
        processedCount++;

        // Progress
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processedCount / elapsed;
        const remaining = (pending.length - processedCount) / rate;
        const eta = remaining > 60 ? `${Math.round(remaining / 60)}min` : `${Math.round(remaining)}s`;

        console.log(
          `[${processedCount}/${pending.length}] ${Math.round(processedCount / pending.length * 100)}% — ETA: ~${eta}`
        );
        console.log(`  ✓ ${label} → ${result.entities} entities, ${result.relationships} relationships`);
      } catch (error: unknown) {
        processedCount++;
        const msg = error instanceof Error ? error.message : String(error);
        markProcessed(db, doc.id, 2, msg);
        console.log(`  ✗ ${label} → error: ${msg}`);
      }
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
});