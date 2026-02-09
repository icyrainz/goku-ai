import type { Config } from '../config.js';
import { chatCompletion } from './client.js';
import { resolveModel } from '../config.js';
import { parseJsonArray } from './parse-json.js';

export interface ExtractedEntity {
  name: string;
  type: string;
  mentions: string[];
}

const ENTITY_EXTRACTION_SYSTEM_PROMPT = `You are an entity extraction system. Given a text, extract all notable entities.
Return a JSON array. Each element must have:
- "name": canonical name of the entity (e.g. "123 Main St", not "the house")
- "type": one of: person, property, expense, bill, organization, location, date, concept
- "mentions": array of exact text spans that refer to this entity

Entity type guide:
- person: people's names, nicknames, roles (e.g. "John Doe", "Mom", "Dr. Smith", "the landlord")
- property: physical properties, addresses, real estate (e.g. "123 Main St", "the apartment")
- expense: monetary amounts (e.g. "$150", "$2,500/month")
- bill: types of bills/payments (e.g. "utility bill", "insurance", "mortgage payment")
- organization: companies, agencies, institutions (e.g. "Acme Corp", "City Water Dept")
- location: places, cities, areas (e.g. "San Francisco", "downtown")
- date: specific dates or time references (e.g. "January 15", "Q1 2024")
- concept: projects, events, abstract ideas (e.g. "kitchen renovation", "project launch")

Rules:
- Extract ALL entities, even small ones. Better to over-extract than miss something.
- Use canonical/normalized names (e.g. "John Doe" not "john").
- Monetary amounts: include the $ sign and number (e.g. "$150").
- If the text contains [[wiki-links]], the text inside [[ ]] is almost certainly an entity — extract it.
- Do NOT extract generic words that aren't specific entities (e.g. don't extract "today" unless it refers to a specific date).
- Return ONLY the JSON array, no other text.`;

export async function extractEntities(
  config: Config,
  text: string,
  existingEntities?: { name: string; type: string }[]
): Promise<ExtractedEntity[]> {
  let userPrompt = `Extract entities from this text:\n\n${text}`;

  // Include known entities so LLM can match against them
  if (existingEntities && existingEntities.length > 0) {
    const entityList = existingEntities
      .slice(0, 200) // Cap at 200 to avoid context overflow
      .map(e => `${e.name} (${e.type})`)
      .join(', ');
    userPrompt += `\n\nKnown entities (reuse these names if they match):\n${entityList}`;
  }

  const response = await chatCompletion(
    config,
    [
      { role: 'system', content: ENTITY_EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    resolveModel(config, 'extraction')
  );

  const parsed = parseJsonArray(response);

  // Validate and filter
  return parsed
    .filter((item: any) =>
      typeof item === 'object' && item !== null &&
      typeof item.name === 'string' && item.name.trim() !== '' &&
      typeof item.type === 'string' && item.type.trim() !== ''
    )
    .map((item: any) => ({
      name: item.name.trim(),
      type: item.type.trim().toLowerCase(),
      mentions: Array.isArray(item.mentions)
        ? item.mentions.filter((m: unknown) => typeof m === 'string')
        : [item.name],
    }));
}