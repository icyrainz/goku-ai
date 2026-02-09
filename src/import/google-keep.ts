import fs from 'node:fs';
import path from 'node:path';

interface KeepNote {
  title?: string;
  textContent?: string;
  listContent?: { text: string; isChecked: boolean }[];
  createdTimestampUsec?: number;
  userEditedTimestampUsec?: number;
  labels?: { name: string }[];
  annotations?: { url: string; title?: string }[];
  isTrashed?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
}

function sanitizeFilename(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80) || 'untitled';
}

function usecToIsoDate(usec: number): string {
  return new Date(usec / 1000).toISOString().slice(0, 10);
}

export function convertGoogleKeep(keepPath: string, vaultPath: string): { created: number; skipped: number } {
  const outputDir = path.join(vaultPath, 'keep');
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs.readdirSync(keepPath).filter(f => f.endsWith('.json'));
  let created = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(keepPath, file), 'utf-8');
    let note: KeepNote;
    try {
      note = JSON.parse(raw);
    } catch {
      skipped++;
      continue;
    }

    // Skip trashed notes
    if (note.isTrashed) {
      skipped++;
      continue;
    }

    // Build markdown content
    const title = note.title || 'Untitled';
    const date = note.createdTimestampUsec
      ? usecToIsoDate(note.createdTimestampUsec)
      : null;
    const tags = (note.labels || []).map(l => l.name);
    
    let md = '---\n';
    md += `title: "${title.replace(/"/g, '\\"')}"\n`;
    if (date) md += `date: ${date}\n`;
    if (tags.length > 0) md += `tags: [${tags.join(', ')}]\n`;
    if (note.isArchived) md += `archived: true\n`;
    if (note.isPinned) md += `pinned: true\n`;
    md += '---\n\n';

    // Body
    if (note.textContent) {
      md += note.textContent + '\n';
    } else if (note.listContent) {
      for (const item of note.listContent) {
        const checkbox = item.isChecked ? '[x]' : '[ ]';
        md += `- ${checkbox} ${item.text}\n`;
      }
    }

    // Annotations/URLs
    if (note.annotations && note.annotations.length > 0) {
      md += '\n---\nLinks:\n';
      for (const ann of note.annotations) {
        if (ann.url) {
          md += `- ${ann.title ? `[${ann.title}](${ann.url})` : ann.url}\n`;
        }
      }
    }

    // Generate filename
    const basename = sanitizeFilename(title);
    let outputFile = path.join(outputDir, `${basename}.md`);

    // Avoid overwriting existing files (idempotent)
    if (fs.existsSync(outputFile)) {
      skipped++;
      continue;
    }

    // Handle name collisions (different notes with same sanitized title)
    let counter = 1;
    while (fs.existsSync(outputFile)) {
      outputFile = path.join(outputDir, `${basename}-${counter}.md`);
      counter++;
    }

    fs.writeFileSync(outputFile, md);
    created++;
  }

  return { created, skipped };
}