import path from 'node:path';
import { readFileSync } from 'node:fs';

export interface ExtractedContent {
  title: string;
  date: string | null;
  extractedText: string;
  metadata: Record<string, unknown>;
}

/**
 * Simple YAML frontmatter parser.
 * Handles:
 *   title: My Note
 *   title: "My Note"
 *   date: 2024-01-15
 *   tags: [tag1, tag2]
 *   tags:
 *     - tag1
 *     - tag2
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { frontmatter: {}, body: content };
  }
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) return { frontmatter: {}, body: content };

  const yamlBlock = content.slice(4, endIndex);
  const body = content.slice(endIndex + 4).trimStart();

  const frontmatter: Record<string, unknown> = {};
  const lines = yamlBlock.split('\n');
  for (const line of lines) {
    // Remove list item prefix (- ) if present
    const trimmedLine = line.replace(/^-?\s*/, '');
    const match = trimmedLine.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, rawVal] = match;
      let value: unknown = rawVal.replace(/^["']|["']$/g, ''); // strip quotes
      // Handle inline arrays: [a, b, c]
      if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
        value = rawVal.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      frontmatter[key] = value;
    }
  }
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

export function extractContent(
  filePath: string,
  absolutePath: string,
  fileType: string
): ExtractedContent {
  const content = readFileSync(absolutePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();

  // Default values
  let title: string;
  let date: string | null;
  let extractedText: string;
  let metadata: Record<string, unknown>;

  if (fileType === 'markdown') {
    // Markdown frontmatter extraction
    const { frontmatter, body } = parseFrontmatter(content);
    metadata = frontmatter;
    title = (frontmatter.title as unknown as string) || path.basename(filePath, path.extname(filePath));
    date = (frontmatter.date as unknown as string | null) || null;
    extractedText = body;
  } else if (fileType === 'text') {
    title = path.basename(filePath, path.extname(filePath));
    extractedText = content;
    date = null;
    metadata = {};
  } else if (fileType === 'csv') {
    // Simple CSV parsing for prototype
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const headers = lines[0].split(',');
    const rows = lines.slice(1);
    let formatted = '';
    for (const row of rows) {
      const values = row.split(',');
      for (let i = 0; i < headers.length; i++) {
        formatted += `${headers[i]}=\\${values[i]}`;
        if (i < headers.length - 1) formatted += ', ';
      }
      formatted += '\n';
    }
    extractedText = formatted.trim();
    title = path.basename(filePath, path.extname(filePath));
    date = null;
    metadata = { headers };
  } else if (fileType === 'json') {
    const parsed = JSON.parse(content);
    const pretty = JSON.stringify(parsed, null, 2);
    extractedText = pretty.substring(0, 50000); // Truncate to 50k chars
    title = parsed.title || parsed.name || path.basename(filePath, path.extname(filePath));
    date = parsed.date || parsed.created || parsed.createdTimestampUsec ? new Date(parsed.createdTimestampUsec).toISOString() : null;
    metadata = {};
  } else {
    // Fallback for unsupported types
    title = path.basename(filePath, path.extname(filePath));
    extractedText = content;
    date = null;
    metadata = {};
  }

  return {
    title,
    date,
    extractedText,
    metadata,
  };
}