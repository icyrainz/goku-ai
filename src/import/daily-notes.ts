import fs from 'node:fs';
import path from 'node:path';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hasFrontmatter(content: string): boolean {
  return content.startsWith('---\n') || content.startsWith('---\r\n');
}

function prependDateFrontmatter(content: string, date: string): string {
  if (hasFrontmatter(content)) return content;
  return `---\ndate: ${date}\n---\n\n${content}`;
}

export function importDailyNotes(
  dirPath: string,
  vaultPath: string
): { imported: number; skipped: number; errors: string[] } {
  const outputDir = path.join(vaultPath, 'daily');
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const file of files) {
    const basename = path.basename(file, '.md');

    if (!DATE_PATTERN.test(basename)) {
      errors.push(`${file}: filename is not a valid YYYY-MM-DD date, skipping`);
      skipped++;
      continue;
    }

    const content = fs.readFileSync(path.join(dirPath, file), 'utf-8').trim();
    if (!content) {
      errors.push(`${file}: empty file, skipping`);
      skipped++;
      continue;
    }

    const outputFile = path.join(outputDir, file);
    if (fs.existsSync(outputFile)) {
      skipped++;
      continue;
    }

    fs.writeFileSync(outputFile, prependDateFrontmatter(content, basename));
    imported++;
  }

  return { imported, skipped, errors };
}
