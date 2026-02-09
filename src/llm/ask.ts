import type { Config } from '../config.js';
import { chatCompletion } from './client.js';
import { resolveModel } from '../config.js';
import { parseJsonArray } from './parse-json.js';
import { searchEntities, searchDocumentEntities, getRelatedEntities, getDocumentsForEntity } from '../core/entities.js';
import type { EntityRow } from '../core/entities.js';
import type Database from 'better-sqlite3';

const ASK_SYSTEM_PROMPT = `You are a knowledge graph assistant. Answer the user's question using ONLY the provided context from their personal knowledge graph.

Rules:
- Only use information from the provided context. Do not make up facts.
- Reference specific entities by name in your answer.
- If the context doesn't contain enough information to answer, say so clearly.
- Be concise and direct.
- When mentioning amounts or dates, be specific.`;

const KEYWORD_EXTRACTION_PROMPT = `Extract search keywords from this question about a personal knowledge graph.
Return a JSON array of strings — only nouns, proper nouns, and named entities.
Omit verbs, stop words, question words, pronouns, and generic actions.
Return ONLY the JSON array, no other text.

Examples:
"where did i order pizza" → ["pizza"]
"how much did the kitchen renovation cost" → ["kitchen renovation"]
"what did John say about the project" → ["John", "project"]
"where did i eat mapo tofu" → ["mapo tofu"]`;

async function extractSearchKeywords(config: Config, question: string): Promise<string[]> {
  try {
    const response = await chatCompletion(
      config,
      [
        { role: 'system', content: KEYWORD_EXTRACTION_PROMPT },
        { role: 'user', content: question },
      ],
      resolveModel(config, 'extraction')
    );

    const parsed = parseJsonArray(response);
    return parsed
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map(s => s.trim());
  } catch {
    return [];
  }
}

const SNIPPET_WINDOW = 300;

function extractRelevantSnippet(
  content: string | null | undefined,
  entityName: string,
  mention: string | null | undefined
): string {
  if (!content) return mention || '';

  const searchTerm = mention || entityName;
  const idx = content.toLowerCase().indexOf(searchTerm.toLowerCase());

  if (idx === -1) return content.slice(0, SNIPPET_WINDOW);

  const start = Math.max(0, idx - SNIPPET_WINDOW / 2);
  const end = Math.min(content.length, idx + searchTerm.length + SNIPPET_WINDOW / 2);
  let snippet = content.slice(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  return snippet;
}

interface AskResult {
  answer: string;
  referencedEntityIds: string[];
}

export async function askQuestion(
  config: Config,
  db: Database.Database,
  question: string
): Promise<AskResult> {
  // Step 1: Extract search keywords from the question, then search entities + documents
  const keywords = await extractSearchKeywords(config, question);
  const entityMap = new Map<string, EntityRow>();

  if (keywords.length > 0) {
    for (const keyword of keywords) {
      for (const entity of searchEntities(db, keyword)) {
        entityMap.set(entity.id, entity);
      }
      for (const entity of searchDocumentEntities(db, keyword)) {
        entityMap.set(entity.id, entity);
      }
    }
  }

  // Fallback: search with the raw question if keyword extraction found nothing
  if (entityMap.size === 0) {
    for (const entity of searchEntities(db, question)) {
      entityMap.set(entity.id, entity);
    }
  }

  const topEntities = [...entityMap.values()].slice(0, 10);

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
        const preview = extractRelevantSnippet(doc.content, entity.name, doc.mention);
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