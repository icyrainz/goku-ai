import type { Config } from '../config.js';
import { chatCompletion } from './client.js';
import { resolveModel } from '../config.js';
import { searchEntities, getRelatedEntities, getDocumentsForEntity } from '../core/entities.js';
import type Database from 'better-sqlite3';

const ASK_SYSTEM_PROMPT = `You are a knowledge graph assistant. Answer the user's question using ONLY the provided context from their personal knowledge graph.

Rules:
- Only use information from the provided context. Do not make up facts.
- Reference specific entities by name in your answer.
- If the context doesn't contain enough information to answer, say so clearly.
- Be concise and direct.
- When mentioning amounts or dates, be specific.`;

interface AskResult {
  answer: string;
  referencedEntityIds: string[];
}

export async function askQuestion(
  config: Config,
  db: Database.Database,
  question: string
): Promise<AskResult> {
  // Step 1: Find relevant entities by searching the question terms
  const searchResults = searchEntities(db, question);
  const topEntities = searchResults.slice(0, 10);

  if (topEntities.length === 0) {
    return {
      answer: 'No relevant entities found in your knowledge graph for this question.',
      referencedEntityIds: [],
    };
  }

  // Step 2: Gather context (entities + 1-hop related + document excerpts)
  const allEntityIds = new Set<string>();
  let contextText = '';

  for (const entity of topEntities) {
    allEntityIds.add(entity.id);
    contextText += `\n## Entity: ${entity.name} (${entity.type})\n`;

    const aliases: string[] = JSON.parse(entity.aliases || '[]');
    if (aliases.length > 0) {
      contextText += `Also known as: ${aliases.join(', ')}\n`;
    }

    // Related entities (1 hop)
    const related = getRelatedEntities(db, entity.id);
    if (related.length > 0) {
      contextText += 'Related:\n';
      for (const rel of related.slice(0, 10)) {
        allEntityIds.add(rel.entity.id);
        const arrow = rel.direction === 'outgoing' ? '→' : '←';
        contextText += `  ${arrow} ${rel.entity.name} (${rel.entity.type}) ${rel.relationshipType}\n`;
      }
    }

    // Document excerpts
    const docs = getDocumentsForEntity(db, entity.id);
    if (docs.length > 0) {
      contextText += 'Mentioned in:\n';
      for (const doc of docs.slice(0, 5)) {
        const source = doc.file_path || `(entry ${doc.date || ''})`;
        const preview = doc.content?.slice(0, 200) || doc.mention || '';
        contextText += `  - ${source}: "${preview}"\n`;
      }
    }
  }

  // Truncate context if too long (~16K chars ≈ ~4K tokens)
  if (contextText.length > 16000) {
    contextText = contextText.slice(0, 16000) + `\n\n[CONTEXT TRUNCATED]`;
  }

  // Step 3: Ask the LLM
  const userPrompt = `Context from knowledge graph:\n${contextText}\n\nQuestion: ${question}`;

  const answer = await chatCompletion(
    config,
    [
      { role: 'system', content: ASK_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    resolveModel(config, 'ask')
  );

  return {
    answer,
    referencedEntityIds: [...allEntityIds],
  };
}