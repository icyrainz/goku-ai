/**
 * Extract a JSON array from an LLM response string.
 * Handles these formats:
 *  1. Pure JSON: [{"name": "..."}]
 *  2. Markdown code block: ```json
 * [...]
 * ```
 *  3. JSON embedded in prose: "Here are the entities:
 * [...]
 * Let me know..."
 *  4. Single object when array expected: {"name": "..."} → [{"name": "..."}]
 *
 * Returns parsed array, or empty array if parsing fails.
 */
export function parseJsonArray(response: string): unknown[] {
  // Strategy 1: Try parsing the whole response as JSON
  try {
    const parsed = JSON.parse(response);
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === 'object' && parsed !== null) return [parsed];
  } catch {}

  // Strategy 2: Extract from markdown code block ```json ... ```
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (Array.isArray(parsed)) return parsed;
      if (typeof parsed === 'object' && parsed !== null) return [parsed];
    } catch {}
  }

  // Strategy 3: Find first [ ... ] in the response
  const bracketStart = response.indexOf('[');
  const bracketEnd = response.lastIndexOf(']');
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    try {
      const parsed = JSON.parse(response.slice(bracketStart, bracketEnd + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }

  // Strategy 4: Find first { ... } in the response
  const braceStart = response.indexOf('{');
  const braceEnd = response.lastIndexOf('}');
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      const parsed = JSON.parse(response.slice(braceStart, braceEnd + 1));
      if (typeof parsed === 'object' && parsed !== null) return [parsed];
    } catch {}
  }

  return [];
}