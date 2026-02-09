import type { Config } from '../config.js';
import { chatCompletion } from './client.js';
import { parseJsonArray } from './parse-json.js';
import { resolveModel } from '../config.js';

export interface ExtractedRelationship {
  source: string;  // entity name
  target: string;  // entity name
  type: string;    // relationship type
}

const ALLOWED_RELATIONSHIP_TYPES = [
  'payment_for', 'bill_for', 'lives_at', 'tenant_of',
  'works_at', 'employee_of', 'located_in', 'owns',
  'visited', 'part_of', 'mentioned_with', 'related_to',
] as const;

const RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT = `You are a relationship extraction system. Given a text and a list of entities found in it, extract relationships between those entities.
Return a JSON array. Each element must have:
- "source": name of the source entity (must be from the provided entity list)
- "target": name of the target entity (must be from the provided entity list)
- "type": one of the allowed types listed below

Allowed relationship types (use ONLY these):
- payment_for: an expense/amount is a payment for something
- bill_for: a bill is associated with a property/service
- lives_at: a person lives at a property
- tenant_of: a person rents a property
- works_at: a person works at an organization
- employee_of: a person is employed by an organization
- located_in: something is in a location
- owns: a person owns a property/thing
- visited: a person went to a place or organization
- part_of: something is part of something else
- mentioned_with: two entities appear together in context but no specific relationship
- related_to: generic fallback when nothing else fits

Rules:
- Only use entity names from the provided list — do not invent new entities.
- Only use relationship types from the allowed list above — do not invent new types.
- Each relationship should be directional: source → target.
- Create only ONE relationship per entity pair. Pick the most specific type.
- Return ONLY the JSON array, no other text.
- If no relationships exist, return an empty array: []`;

export async function extractRelationships(
  config: Config,
  text: string,
  entities: { name: string; type: string }[]
): Promise<ExtractedRelationship[]> {
  if (entities.length < 2) return []; // Need at least 2 entities for a relationship

  const entityList = entities.map(e => `${e.name} (${e.type})`).join('\n');

  const userPrompt = `Text:\n${text}\n\nEntities found:\n${entityList}\n\nExtract relationships between these entities.`;

  const response = await chatCompletion(
    config,
    [
      { role: 'system', content: RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    resolveModel(config, 'extraction')
  );

  const parsed = parseJsonArray(response);

  const entityNames = new Set(entities.map(e => e.name.toLowerCase()));
  const allowedTypes = new Set<string>(ALLOWED_RELATIONSHIP_TYPES);
  const seenPairs = new Set<string>();

  return parsed
    .filter((item: any) =>
      typeof item === 'object' && item !== null &&
      typeof item.source === 'string' &&
      typeof item.target === 'string' &&
      typeof item.type === 'string' &&
      item.source !== item.target
    )
    .filter((item: any) =>
      entityNames.has(item.source.toLowerCase()) &&
      entityNames.has(item.target.toLowerCase())
    )
    .map((item: any) => {
      const type = item.type.trim().toLowerCase().replace(/\s+/g, '_');
      return {
        source: item.source.trim(),
        target: item.target.trim(),
        type: allowedTypes.has(type) ? type : 'related_to',
      };
    })
    .filter((item) => {
      const pairKey = `${item.source.toLowerCase()}::${item.target.toLowerCase()}`;
      if (seenPairs.has(pairKey)) return false;
      seenPairs.add(pairKey);
      return true;
    });
}