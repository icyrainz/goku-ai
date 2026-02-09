import type { Config } from '../config.js';
import { chatCompletion } from './client.js';
import { parseJsonArray } from './parse-json.js';
import { resolveModel } from '../config.js';

export interface ExtractedRelationship {
  source: string;  // entity name
  target: string;  // entity name
  type: string;    // relationship type
}

const RELATIONSHIP_EXTRACTION_SYSTEM_PROMPT = `You are a relationship extraction system. Given a text and a list of entities found in it, extract relationships between those entities.
Return a JSON array. Each element must have:
- "source": name of the source entity (must be from the provided entity list)
- "target": name of the target entity (must be from the provided entity list)
- "type": relationship type as a snake_case verb phrase

Common relationship types:
- payment_for: an expense/amount is a payment for something
- bill_for: a bill is associated with a property/service
- lives_at / tenant_of: a person lives at a property
- works_at / employee_of: a person works at an organization
- located_in: something is in a location
- owns: a person owns a property/thing
- related_to: generic relationship when nothing more specific fits

Rules:
- Only use entity names from the provided list — do not invent new entities.
- Each relationship should be directional: source → target.
- Extract ALL relationships implied by the text.
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

  // Validate: source and target must be from our entity list
  const entityNames = new Set(entities.map(e => e.name.toLowerCase()));

  return parsed
    .filter((item: any) =>
      typeof item === 'object' && item !== null &&
      typeof item.source === 'string' &&
      typeof item.target === 'string' &&
      typeof item.type === 'string' &&
      item.source !== item.target // no self-relationships
    )
    .filter((item: any) =>
      entityNames.has(item.source.toLowerCase()) &&
      entityNames.has(item.target.toLowerCase())
    )
    .map((item: any) => ({
      source: item.source.trim(),
      target: item.target.trim(),
      type: item.type.trim().toLowerCase().replace(/\s+/g, '_'),
    }));
}