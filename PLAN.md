# Implementation Plan

Each task is self-contained. Prerequisites list which tasks must be complete before starting. Every task specifies exact files, function signatures, and code patterns. No judgment calls required.

---

## Phase 1: Project Scaffolding & Database

### Task 1.1 — Initialize project

**Prerequisites**: None
**Creates**: `package.json`, `tsconfig.json`, `src/cli/index.ts`

1. Run `npm init -y`

2. Edit `package.json` to exactly:
```json
{
  "name": "goku-ai",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "note": "./src/cli/index.ts"
  },
  "scripts": {
    "dev": "tsx src/cli/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

3. Install dependencies:
```bash
npm install better-sqlite3 commander nanoid openai smol-toml xxhash-wasm fuse.js
npm install -D tsx typescript @types/better-sqlite3 @types/node vitest
```

4. Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

5. Create `src/cli/index.ts`:
```typescript
import { Command } from 'commander';

const program = new Command();

program
  .name('note')
  .description('AI-powered personal knowledge graph over your files')
  .version('0.1.0');

program.parse();
```

**Verify**: `npx tsx src/cli/index.ts --help` prints usage with name and description.

---

### Task 1.2 — Config loading

**Prerequisites**: Task 1.1
**Creates**: `src/config.ts`

Create `src/config.ts` that exports a `loadConfig()` function.

**Exact interface:**
```typescript
export interface LlmConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  extractionModel: string; // falls back to model if empty
  askModel: string;        // falls back to model if empty
}

export interface Config {
  vault: {
    path: string; // absolute path, ~ expanded
  };
  llm: LlmConfig;
}
```

**Logic:**
1. Try to read `~/.config/goku-ai/config.toml` using `fs.readFileSync`. If it doesn't exist, use all defaults.
2. Parse TOML with `smol-toml` (`import { parse } from 'smol-toml'`).
3. Apply env var overrides on top of file values (env vars win).
4. Apply defaults for any missing values.

**Defaults:**
```
vault.path        = "~/notes"
llm.base_url      = "http://localhost:11434/v1"
llm.model         = "mistral"
llm.api_key       = ""
llm.extraction.model = ""  (use llm.model)
llm.ask.model     = ""  (use llm.model)
```

**Env var mapping:**
| Env var | Config field |
|---------|-------------|
| `NOTE_VAULT_PATH` | vault.path |
| `NOTE_LLM_BASE_URL` | llm.baseUrl |
| `NOTE_LLM_MODEL` | llm.model |
| `NOTE_LLM_API_KEY` | llm.apiKey |

**Tilde expansion**: Replace leading `~` with `os.homedir()` in `vault.path`.

**`resolveModel` helper** (also exported):
```typescript
export function resolveModel(config: Config, purpose: 'extraction' | 'ask'): string {
  if (purpose === 'extraction' && config.llm.extractionModel) return config.llm.extractionModel;
  if (purpose === 'ask' && config.llm.askModel) return config.llm.askModel;
  return config.llm.model;
}
```

**TOML file format** the parser expects:
```toml
[vault]
path = "~/notes"

[llm]
base_url = "http://localhost:11434/v1"
model = "mistral"
api_key = ""

[llm.extraction]
model = ""

[llm.ask]
model = ""
```

**Verify**: Import `loadConfig()` in index.ts, call it, `console.log` the result. Should show defaults.

---

### Task 1.3 — Database setup & schema

**Prerequisites**: Task 1.2
**Creates**: `src/core/db.ts`

Create `src/core/db.ts` that exports `getDb(config: Config)` returning a `better-sqlite3` Database instance.

**Exact behavior:**
1. DB path = `path.join(config.vault.path, '.app-data', 'index.db')`
2. Create the `.app-data` directory if it doesn't exist (`fs.mkdirSync` with `recursive: true`)
3. Open database with `new Database(dbPath)`
4. Run these pragmas:
```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
```
5. Run schema creation (use `db.exec()`). Use `IF NOT EXISTS` on all CREATE statements so it's idempotent.

**Exact SQL to execute** (copy verbatim):
```sql
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('file', 'entry')),
  file_path     TEXT UNIQUE,
  file_hash     TEXT,
  file_type     TEXT,
  content       TEXT,
  title         TEXT,
  date          TEXT,
  metadata      TEXT,
  extracted_text TEXT,
  processed     INTEGER NOT NULL DEFAULT 0,
  error_msg     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  aliases     TEXT DEFAULT '[]',
  metadata    TEXT DEFAULT '{}',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS relationships (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  properties  TEXT DEFAULT '{}',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_entities (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  mention     TEXT,
  confidence  REAL DEFAULT 1.0,
  PRIMARY KEY (document_id, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_documents_kind ON documents(kind);
CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
CREATE INDEX IF NOT EXISTS idx_documents_processed ON documents(processed);
CREATE INDEX IF NOT EXISTS idx_documents_date ON documents(date);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_document_entities_doc ON document_entities(document_id);
CREATE INDEX IF NOT EXISTS idx_document_entities_entity ON document_entities(entity_id);
```

**FTS5 tables** — these cannot use `IF NOT EXISTS`, so check first:
```typescript
const hasFts = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='documents_fts'"
).get();

if (!hasFts) {
  db.exec(`
    CREATE VIRTUAL TABLE documents_fts USING fts5(
      title, extracted_text,
      content=documents, content_rowid=rowid
    );
    CREATE VIRTUAL TABLE entities_fts USING fts5(
      name, aliases,
      content=entities, content_rowid=rowid
    );
  `);
}
```

**Singleton pattern**: Use a module-level variable. `getDb` creates the db on first call, returns cached instance on subsequent calls.

```typescript
let _db: Database.Database | null = null;

export function getDb(config: Config): Database.Database {
  if (_db) return _db;
  // ... create and return
  _db = db;
  return _db;
}
```

**Verify**: Call `getDb()`, check that `.app-data/index.db` file is created in vault path. Run `sqlite3 index.db ".tables"` and see all tables.

---

### Task 1.4 — `note init` command

**Prerequisites**: Task 1.2, Task 1.3
**Creates**: `src/cli/init.ts`
**Modifies**: `src/cli/index.ts`

Create `src/cli/init.ts`:
```typescript
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';

export const initCommand = new Command('init')
  .description('Initialize a vault directory')
  .argument('[path]', 'vault directory path', '~/notes')
  .action((vaultPath: string) => {
    // Expand ~
    const resolved = vaultPath.startsWith('~')
      ? path.join(os.homedir(), vaultPath.slice(1))
      : path.resolve(vaultPath);

    // Create vault directory
    fs.mkdirSync(resolved, { recursive: true });

    // Create .app-data subdirectory
    fs.mkdirSync(path.join(resolved, '.app-data'), { recursive: true });

    // Load config with overridden vault path, initialize DB
    const config = loadConfig();
    config.vault.path = resolved;
    getDb(config);

    // Write default config if none exists
    const configDir = path.join(os.homedir(), '.config', 'goku-ai');
    const configPath = path.join(configDir, 'config.toml');
    if (!fs.existsSync(configPath)) {
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, `[vault]\npath = "${resolved}"\n\n[llm]\nbase_url = "http://localhost:11434/v1"\nmodel = "mistral"\napi_key = ""\n`);
    }

    console.log(`Vault initialized at ${resolved}`);
  });
```

Modify `src/cli/index.ts` — add:
```typescript
import { initCommand } from './init.js';
program.addCommand(initCommand);
```

**Verify**: `npx tsx src/cli/index.ts init /tmp/test-vault` creates directory and DB file.

---

### Task 1.5 — `note status` command

**Prerequisites**: Task 1.3
**Creates**: `src/cli/status.ts`
**Modifies**: `src/cli/index.ts`

Create `src/cli/status.ts` with a `statusCommand`.

**Exact SQL queries** to run:
```sql
-- Total documents by kind
SELECT kind, COUNT(*) as count FROM documents GROUP BY kind;

-- Processing status
SELECT processed, COUNT(*) as count FROM documents GROUP BY processed;

-- Entity counts by type
SELECT type, COUNT(*) as count FROM entities GROUP BY type ORDER BY count DESC;

-- Total relationships
SELECT COUNT(*) as count FROM relationships;
```

**Count vault files** by recursively walking `config.vault.path`, skipping hidden dirs (names starting with `.`). Count files only, not directories.

**Output format** (print to stdout):
```
Vault:       /path/to/vault (N files)
Entries:     N quick entries

Processing:
  ✓ Processed:  N
  ⏳ Pending:    N
  ✗ Errored:     N

Graph:
  Entities:      N (person: N, property: N, ...)
  Relationships: N
```

If `processed=0` → Pending, `processed=1` → Processed, `processed=2` → Errored.
If no entities exist, print `Entities: 0`. If no documents, print `Vault: ... (0 files)` and `Entries: 0 quick entries`.

Register in `src/cli/index.ts` same pattern as init.

**Verify**: After `note init`, `note status` shows zeros everywhere.

---

## Phase 2: Vault Scanning

### Task 2.1 — File type detection utility

**Prerequisites**: Task 1.1
**Creates**: `src/scanner/types.ts`

Create a file that maps file extensions to our type names and exports a detection function.

```typescript
const EXTENSION_MAP: Record<string, string> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.csv': 'csv',
  '.json': 'json',
  '.tsv': 'csv',
};

// Hidden dirs to always skip when scanning
export const SKIP_DIRS = new Set([
  '.git', '.obsidian', '.app-data', '.trash',
  '.DS_Store', 'node_modules',
]);

export function detectFileType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

export function isSupportedFile(filePath: string): boolean {
  return detectFileType(filePath) !== null;
}
```

**Verify**: Unit test — `detectFileType('foo.md')` returns `'markdown'`, `detectFileType('foo.png')` returns `null`.

---

### Task 2.2 — File hashing utility

**Prerequisites**: Task 1.1
**Creates**: `src/scanner/hash.ts`

```typescript
import { readFileSync } from 'node:fs';
import initXxhash from 'xxhash-wasm';

let hasher: Awaited<ReturnType<typeof initXxhash>> | null = null;

async function getHasher() {
  if (!hasher) {
    hasher = await initXxhash();
  }
  return hasher;
}

export async function hashFile(absolutePath: string): Promise<string> {
  const h = await getHasher();
  const content = readFileSync(absolutePath);
  return h.h64ToString(content);
}
```

The function reads the entire file into a Buffer and computes xxh64, returning a hex string.

**Verify**: Hash a known file, hash it again, same result. Modify file, hash changes.

---

### Task 2.3 — Content extractors

**Prerequisites**: Task 2.1
**Creates**: `src/scanner/extractors.ts`

Export a single function:
```typescript
export interface ExtractedContent {
  title: string;
  date: string | null;      // ISO date string or null
  extractedText: string;     // The text to send to LLM
  metadata: Record<string, unknown>; // frontmatter, tags, etc.
}

export function extractContent(
  filePath: string,      // relative path in vault (e.g. 'daily/2024-01-15.md')
  absolutePath: string,  // full path on disk
  fileType: string       // from detectFileType()
): ExtractedContent
```

**Markdown extractor** (`fileType === 'markdown'`):
1. Read file content as UTF-8 string.
2. Check if file starts with `---\n`. If yes, find the closing `---\n` and extract the YAML block between them.
3. Parse YAML frontmatter manually (don't add a YAML dependency). Simple key-value extraction:
   - Look for `title: <value>`, `date: <value>`, `tags: [...]` lines.
   - For `title:` — strip quotes, use the value.
   - For `date:` — strip quotes, use the value.
   - For `tags:` — if it's a YAML array `[tag1, tag2]`, split by comma and trim. If multi-line `- tag` format, collect lines starting with `- `.
   - Store all frontmatter key-value pairs in `metadata.frontmatter`.
4. `extractedText` = everything after the closing `---` (the body). Do NOT strip `[[wiki-links]]` — leave them as-is.
5. `title` = frontmatter title, or filename without extension if no frontmatter title.
6. `date` = frontmatter date, or `null`.

**Simple YAML parser** — implement as a function, NOT a dependency. Handle these patterns only:
```
title: My Note
title: "My Note"
date: 2024-01-15
tags: [tag1, tag2]
tags:
  - tag1
  - tag2
```

Pattern to extract frontmatter:
```typescript
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
    const match = line.match(/^(\w+):\s*(.*)$/);
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

  return { frontmatter, body };
}
```

**Text extractor** (`fileType === 'text'`):
1. Read file as UTF-8.
2. `title` = filename without extension.
3. `extractedText` = full file content.
4. `date` = null.
5. `metadata` = `{}`.

**CSV extractor** (`fileType === 'csv'`):
1. Read file as UTF-8.
2. Split by newlines, split each line by comma (basic — no quoted fields handling needed for prototype).
3. First row = headers.
4. Format as readable text. For each subsequent row:
   ```
   Row 1: header1=value1, header2=value2, header3=value3
   Row 2: header1=value1, header2=value2, header3=value3
   ```
5. `title` = filename without extension.
6. `extractedText` = the formatted text.
7. `date` = null.
8. `metadata` = `{ headers: [...] }`.

**JSON extractor** (`fileType === 'json'`):
1. Read file as UTF-8 and `JSON.parse`.
2. `extractedText` = `JSON.stringify(parsed, null, 2)` — pretty-printed JSON. Truncate to 50,000 characters if longer.
3. `title` = filename without extension, or `parsed.title` / `parsed.name` if those keys exist.
4. `date` = `parsed.date` or `parsed.created` or `parsed.createdTimestampUsec` (convert usec to ISO date) if they exist, else `null`.
5. `metadata` = `{}`.

**Verify**: Write unit tests. A markdown file with frontmatter returns correct title/date/body. A CSV file returns row-formatted text. A plain .txt file passes through.

---

### Task 2.4 — Vault directory walker

**Prerequisites**: Task 2.1
**Creates**: `src/scanner/walk.ts`

Export a function that recursively lists all supported files in the vault:

```typescript
export interface VaultFile {
  relativePath: string;  // e.g. 'daily/2024-01-15.md'
  absolutePath: string;  // e.g. '/home/user/notes/daily/2024-01-15.md'
  fileType: string;      // e.g. 'markdown'
}

export function walkVault(vaultPath: string): VaultFile[]
```

**Logic:**
1. Use `fs.readdirSync(dir, { withFileTypes: true })` recursively.
2. For each entry:
   - If directory: skip if name is in `SKIP_DIRS` set or starts with `.`. Otherwise recurse.
   - If file: call `detectFileType()`. If `null` (unsupported), skip. Otherwise include.
3. Return array of all supported files, sorted by `relativePath` alphabetically.
4. `relativePath` = path relative to `vaultPath` using `path.relative()`.

**Verify**: Create a temp directory with `.md`, `.txt`, `.png` files and a `.git/` folder. Walk returns only `.md` and `.txt`, skips `.png` and `.git/`.

---

### Task 2.5 — Document CRUD module

**Prerequisites**: Task 1.3
**Creates**: `src/core/documents.ts`

Export these functions. All use `better-sqlite3` prepared statements.

```typescript
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

// Timestamp helper - all functions use this
function now(): string {
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createFileDocument(
  db: Database.Database,
  filePath: string,     // relative path
  fileHash: string,
  fileType: string,
  title: string,
  date: string | null,
  extractedText: string,
  metadata: Record<string, unknown>
): string  // returns document id

export function createEntry(
  db: Database.Database,
  content: string
): string  // returns document id

export function getDocumentByFilePath(
  db: Database.Database,
  filePath: string
): { id: string; file_hash: string; processed: number } | undefined

export function getDocumentById(
  db: Database.Database,
  id: string
): DocumentRow | undefined

export function getPendingDocuments(
  db: Database.Database
): DocumentRow[]  // WHERE processed = 0

export function getAllDocuments(
  db: Database.Database
): DocumentRow[]

export function updateFileDocument(
  db: Database.Database,
  id: string,
  fileHash: string,
  title: string,
  date: string | null,
  extractedText: string,
  metadata: Record<string, unknown>
): void  // Also sets processed=0, updated_at=now

export function markProcessed(
  db: Database.Database,
  id: string,
  status: 1 | 2,
  errorMsg?: string
): void

export function deleteDocument(
  db: Database.Database,
  id: string
): void

export function getDocumentCounts(
  db: Database.Database
): { total: number; files: number; entries: number; processed: number; pending: number; errored: number }
```

**Type for rows:**
```typescript
export interface DocumentRow {
  id: string;
  kind: 'file' | 'entry';
  file_path: string | null;
  file_hash: string | null;
  file_type: string | null;
  content: string | null;
  title: string | null;
  date: string | null;
  metadata: string | null;  // JSON string
  extracted_text: string | null;
  processed: number;
  error_msg: string | null;
  created_at: string;
  updated_at: string;
}
```

**`createFileDocument` SQL:**
```sql
INSERT INTO documents (id, kind, file_path, file_hash, file_type, title, date, metadata, extracted_text, processed, created_at, updated_at)
VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
```

**`createEntry` SQL:**
```sql
INSERT INTO documents (id, kind, content, title, date, extracted_text, processed, created_at, updated_at)
VALUES (?, 'entry', ?, ?, ?, ?, 0, ?, ?)
```
For entries: `title` = first line of content (truncated to 100 chars), `date` = today's date, `extracted_text` = content (same as content for entries).

**`updateFileDocument`**: Also clear any existing entity links for this document:
```sql
DELETE FROM document_entities WHERE document_id = ?;
UPDATE documents SET file_hash=?, title=?, date=?, metadata=?, extracted_text=?, processed=0, error_msg=NULL, updated_at=? WHERE id=?;
```

**`deleteDocument`**: CASCADE will handle `document_entities`. Just `DELETE FROM documents WHERE id = ?`.

**FTS5 sync**: After every INSERT, UPDATE, or DELETE on `documents`, also sync the FTS table:
```typescript
// After INSERT:
db.prepare('INSERT INTO documents_fts(rowid, title, extracted_text) SELECT rowid, title, extracted_text FROM documents WHERE id = ?').run(id);

// After UPDATE:
db.prepare('DELETE FROM documents_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)').run(id);
db.prepare('INSERT INTO documents_fts(rowid, title, extracted_text) SELECT rowid, title, extracted_text FROM documents WHERE id = ?').run(id);

// After DELETE (before the actual delete):
db.prepare('DELETE FROM documents_fts WHERE rowid = (SELECT rowid FROM documents WHERE id = ?)').run(id);
```

**Verify**: Create a document, query it back, update it, delete it. All operations succeed.

---

### Task 2.6 — `note scan` command

**Prerequisites**: Task 2.2, Task 2.3, Task 2.4, Task 2.5
**Creates**: `src/cli/scan.ts`
**Modifies**: `src/cli/index.ts`

Orchestrates scanning. Exact logic:

```typescript
export async function scanVault(config: Config, db: Database.Database): Promise<void> {
  const files = walkVault(config.vault.path);
  let newCount = 0, modifiedCount = 0, unchangedCount = 0, deletedCount = 0;

  // Track which file paths we see (for detecting deletions)
  const seenPaths = new Set<string>();

  for (const file of files) {
    seenPaths.add(file.relativePath);
    const hash = await hashFile(file.absolutePath);
    const existing = getDocumentByFilePath(db, file.relativePath);

    if (!existing) {
      // New file
      const extracted = extractContent(file.relativePath, file.absolutePath, file.fileType);
      createFileDocument(db, file.relativePath, hash, file.fileType,
        extracted.title, extracted.date, extracted.extractedText,
        extracted.metadata);
      newCount++;
    } else if (existing.file_hash !== hash) {
      // Modified file
      const extracted = extractContent(file.relativePath, file.absolutePath, file.fileType);
      updateFileDocument(db, existing.id, hash,
        extracted.title, extracted.date, extracted.extractedText,
        extracted.metadata);
      modifiedCount++;
    } else {
      unchangedCount++;
    }
  }

  // Detect deleted files: documents with kind='file' whose file_path is not in seenPaths
  const allFileDocs = db.prepare(
    "SELECT id, file_path FROM documents WHERE kind = 'file'"
  ).all() as { id: string; file_path: string }[];

  for (const doc of allFileDocs) {
    if (!seenPaths.has(doc.file_path)) {
      deleteDocument(db, doc.id);
      deletedCount++;
    }
  }

  // Print summary
  const pendingCount = db.prepare(
    "SELECT COUNT(*) as count FROM documents WHERE processed = 0"
  ).get() as { count: number };

  console.log(`Scanning vault... ${files.length} files found`);
  console.log(`  ${newCount} new, ${modifiedCount} modified, ${unchangedCount} unchanged, ${deletedCount} deleted`);
  if (pendingCount.count > 0) {
    console.log(`Run \`note process\` to extract entities from ${pendingCount.count} pending documents`);
  }
}
```

Register as Commander command: `note scan` — no arguments, loads config, opens db, calls `scanVault`.

**Verify**: Create vault with a few `.md` files, run `note scan`, see counts. Modify a file, re-scan, see "1 modified". Delete a file, re-scan, see "1 deleted". `note status` reflects changes.

---

## Phase 3: Quick Entries

### Task 3.1 — `note add` command

**Prerequisites**: Task 2.5
**Creates**: `src/cli/add.ts`
**Modifies**: `src/cli/index.ts`

```typescript
import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { createEntry } from '../core/documents.js';

export const addCommand = new Command('add')
  .description('Add a quick daily entry')
  .action(() => {
    const config = loadConfig();
    const db = getDb(config);

    // Create temp file
    const tmpFile = path.join(os.tmpdir(), `note-${Date.now()}.md`);
    fs.writeFileSync(tmpFile, '');

    // Open editor
    const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
    const result = spawnSync(editor, [tmpFile], { stdio: 'inherit' });

    if (result.status !== 0) {
      console.error('Editor exited with error');
      fs.unlinkSync(tmpFile);
      return;
    }

    // Read content
    const content = fs.readFileSync(tmpFile, 'utf-8').trim();
    fs.unlinkSync(tmpFile);

    if (!content) {
      console.log('Empty entry, nothing saved.');
      return;
    }

    const id = createEntry(db, content);
    console.log(`Entry saved (${id}). Run \`note process\` to extract entities.`);
  });
```

Register in `src/cli/index.ts`.

**Verify**: `note add` opens editor, type text, save/quit, see confirmation. `note status` shows 1 pending entry.

---

## Phase 4: LLM Client & Entity Extraction

### Task 4.1 — LLM client wrapper

**Prerequisites**: Task 1.2
**Creates**: `src/llm/client.ts`

```typescript
import OpenAI from 'openai';
import type { Config } from '../config.js';

let _client: OpenAI | null = null;

export function getLlmClient(config: Config): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({
    baseURL: config.llm.baseUrl,
    apiKey: config.llm.apiKey || 'not-needed',
  });
  return _client;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatCompletion(
  config: Config,
  messages: ChatMessage[],
  model?: string
): Promise<string> {
  const client = getLlmClient(config);
  const useModel = model || config.llm.model;

  try {
    const response = await client.chat.completions.create({
      model: useModel,
      messages,
      temperature: 0.1,  // Low temperature for consistent structured output
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response from LLM');
    return content;
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed')) {
        throw new Error(
          `Cannot connect to LLM at ${config.llm.baseUrl}. Is Ollama running?\n` +
          `Start it with: ollama serve`
        );
      }
    }
    throw error;
  }
}
```

**Verify**: With Ollama running, call `chatCompletion(config, [{ role: 'user', content: 'Say hello' }])` and get a response string back.

---

### Task 4.2 — JSON response parser utility

**Prerequisites**: Task 1.1
**Creates**: `src/llm/parse-json.ts`

LLMs return JSON in unpredictable formats. This utility extracts JSON from any response.

```typescript
/**
 * Extract a JSON array from an LLM response string.
 * Handles these formats:
 * 1. Pure JSON: [{"name": "..."}]
 * 2. Markdown code block: ```json\n[...]\n```
 * 3. JSON embedded in prose: "Here are the entities:\n[...]\nLet me know..."
 * 4. Single object when array expected: {"name": "..."} → [{"name": "..."}]
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
```

**Verify**: Unit tests:
- `parseJsonArray('[{"a":1}]')` → `[{a:1}]`
- `parseJsonArray('```json\n[{"a":1}]\n```')` → `[{a:1}]`
- `parseJsonArray('Here are results:\n[{"a":1}]\nDone.')` → `[{a:1}]`
- `parseJsonArray('not json at all')` → `[]`
- `parseJsonArray('{"a":1}')` → `[{a:1}]`

---

### Task 4.3 — Entity extraction LLM prompt

**Prerequisites**: Task 4.1, Task 4.2
**Creates**: `src/llm/extract.ts`

```typescript
import type { Config } from '../config.js';
import { chatCompletion } from './client.js';
import { parseJsonArray } from './parse-json.js';
import { resolveModel } from '../config.js';

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
```

**Verify**: With Ollama running, call `extractEntities(config, "Paid $150 for utility bill for the house on 123 Main St")`. Should return array with entities for the property, expense, and bill.

---

### Task 4.4 — Relationship extraction LLM prompt

**Prerequisites**: Task 4.1, Task 4.2
**Creates**: `src/llm/relate.ts`

```typescript
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
```

**Verify**: Call with text + entities list. Should return relationship array with valid source/target references.

---

### Task 4.5 — Entity CRUD & deduplication

**Prerequisites**: Task 1.3
**Creates**: `src/core/entities.ts`

```typescript
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import Fuse from 'fuse.js';

function now(): string { return new Date().toISOString(); }

export interface EntityRow {
  id: string;
  name: string;
  type: string;
  aliases: string;  // JSON array string
  metadata: string; // JSON object string
  created_at: string;
  updated_at: string;
}

/**
 * Find an existing entity or create a new one.
 * Dedup strategy:
 *   1. Exact match on name (case-insensitive)
 *   2. Exact match on any alias
 *   3. Fuzzy match (Fuse.js, threshold 0.3) on same-type entities
 *   4. No match → create new
 *
 * Returns the entity ID (existing or newly created).
 */
export function findOrCreateEntity(
  db: Database.Database,
  name: string,
  type: string,
  mentions: string[] = []
): string {
  // 1. Exact name match (case-insensitive)
  const exact = db.prepare(
    'SELECT id, aliases FROM entities WHERE LOWER(name) = LOWER(?) AND type = ?'
  ).get(name, type) as { id: string; aliases: string } | undefined;

  if (exact) {
    addAliases(db, exact.id, mentions, exact.aliases);
    return exact.id;
  }

  // 2. Alias match — search all entities of same type
  const sameType = db.prepare(
    'SELECT id, name, aliases FROM entities WHERE type = ?'
  ).all(type) as { id: string; name: string; aliases: string }[];

  for (const entity of sameType) {
    const aliases: string[] = JSON.parse(entity.aliases || '[]');
    const allNames = [entity.name.toLowerCase(), ...aliases.map(a => a.toLowerCase())];
    if (allNames.includes(name.toLowerCase())) {
      addAliases(db, entity.id, mentions, entity.aliases);
      return entity.id;
    }
  }

  // 3. Fuzzy match using Fuse.js
  if (sameType.length > 0) {
    const fuse = new Fuse(sameType, {
      keys: ['name'],
      threshold: 0.3,       // 0 = exact, 1 = anything. 0.3 is moderately strict.
      includeScore: true,
    });
    const results = fuse.search(name);
    if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.3) {
      const match = results[0].item;
      addAliases(db, match.id, [name, ...mentions], match.aliases);
      return match.id;
    }
  }

  // 4. No match — create new entity
  const id = nanoid();
  const aliases = JSON.stringify([...new Set(mentions.filter(m => m.toLowerCase() !== name.toLowerCase()))]);
  db.prepare(
    'INSERT INTO entities (id, name, type, aliases, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, name, type, aliases, '{}', now(), now());

  // Sync FTS
  db.prepare(
    'INSERT INTO entities_fts(rowid, name, aliases) SELECT rowid, name, aliases FROM entities WHERE id = ?'
  ).run(id);

  return id;
}

/** Add new aliases to an existing entity (dedup, max 50 aliases) */
function addAliases(db: Database.Database, entityId: string, newAliases: string[], currentAliasesJson: string): void {
  const current: string[] = JSON.parse(currentAliasesJson || '[]');
  const currentLower = new Set(current.map(a => a.toLowerCase()));
  const entity = db.prepare('SELECT name FROM entities WHERE id = ?').get(entityId) as { name: string };
  currentLower.add(entity.name.toLowerCase());

  let added = false;
  for (const alias of newAliases) {
    if (alias && !currentLower.has(alias.toLowerCase())) {
      current.push(alias);
      currentLower.add(alias.toLowerCase());
      added = true;
    }
  }

  if (added) {
    const trimmed = current.slice(0, 50); // Max 50 aliases
    db.prepare('UPDATE entities SET aliases = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(trimmed), now(), entityId);

    // Sync FTS
    db.prepare('DELETE FROM entities_fts WHERE rowid = (SELECT rowid FROM entities WHERE id = ?)').run(entityId);
    db.prepare('INSERT INTO entities_fts(rowid, name, aliases) SELECT rowid, name, aliases FROM entities WHERE id = ?').run(entityId);
  }
}

export function getAllEntities(db: Database.Database): { name: string; type: string }[] {
  return db.prepare('SELECT name, type FROM entities ORDER BY name').all() as { name: string; type: string }[];
}

export function getEntityByNameOrId(db: Database.Database, query: string): EntityRow | undefined {
  // Try exact ID
  const byId = db.prepare('SELECT * FROM entities WHERE id = ?').get(query) as EntityRow | undefined;
  if (byId) return byId;

  // Try exact name (case-insensitive)
  const byName = db.prepare('SELECT * FROM entities WHERE LOWER(name) = LOWER(?)').get(query) as EntityRow | undefined;
  if (byName) return byName;

  return undefined;
}

export function searchEntities(db: Database.Database, query: string): EntityRow[] {
  // FTS5 search
  const ftsResults = db.prepare(
    `SELECT e.* FROM entities e
     JOIN entities_fts f ON e.rowid = f.rowid
     WHERE entities_fts MATCH ?
     ORDER BY rank
     LIMIT 20`
  ).all(query) as EntityRow[];

  if (ftsResults.length > 0) return ftsResults;

  // Fallback: fuzzy search with Fuse.js
  const allEntities = db.prepare('SELECT * FROM entities').all() as EntityRow[];
  const fuse = new Fuse(allEntities, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
  });
  return fuse.search(query).slice(0, 20).map(r => r.item);
}

export function getRelatedEntities(db: Database.Database, entityId: string): {
  entity: EntityRow;
  relationshipType: string;
  direction: 'outgoing' | 'incoming';
}[] {
  const outgoing = db.prepare(`
    SELECT e.*, r.type as rel_type FROM entities e
    JOIN relationships r ON e.id = r.target_id
    WHERE r.source_id = ?
  `).all(entityId) as (EntityRow & { rel_type: string })[];

  const incoming = db.prepare(`
    SELECT e.*, r.type as rel_type FROM entities e
    JOIN relationships r ON e.id = r.source_id
    WHERE r.target_id = ?
  `).all(entityId) as (EntityRow & { rel_type: string })[];

  return [
    ...outgoing.map(e => ({ entity: e, relationshipType: e.rel_type, direction: 'outgoing' as const })),
    ...incoming.map(e => ({ entity: e, relationshipType: e.rel_type, direction: 'incoming' as const })),
  ];
}

export function getDocumentsForEntity(db: Database.Database, entityId: string): {
  document_id: string;
  mention: string | null;
  kind: string;
  file_path: string | null;
  title: string | null;
  date: string | null;
  content: string | null;
}[] {
  return db.prepare(`
    SELECT d.id as document_id, de.mention, d.kind, d.file_path, d.title, d.date, d.content
    FROM documents d
    JOIN document_entities de ON d.id = de.document_id
    WHERE de.entity_id = ?
    ORDER BY d.date DESC
  `).all(entityId) as any[];
}

export function getEntityCounts(db: Database.Database): { type: string; count: number }[] {
  return db.prepare('SELECT type, COUNT(*) as count FROM entities GROUP BY type ORDER BY count DESC').all() as any[];
}
```

**Verify**: Create entities, check dedup works. "123 Main St" and "123 main st" should return the same ID. Fuzzy match "Main Street" against "123 Main St" with type match.

---

### Task 4.6 — Relationship CRUD

**Prerequisites**: Task 1.3
**Creates**: `src/core/relationships.ts`

```typescript
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';

function now(): string { return new Date().toISOString(); }

/**
 * Find existing relationship or create new one.
 * Dedup: same source_id + target_id + type = same relationship.
 */
export function findOrCreateRelationship(
  db: Database.Database,
  sourceId: string,
  targetId: string,
  type: string,
  properties?: Record<string, unknown>
): string {
  const existing = db.prepare(
    'SELECT id FROM relationships WHERE source_id = ? AND target_id = ? AND type = ?'
  ).get(sourceId, targetId, type) as { id: string } | undefined;

  if (existing) return existing.id;

  const id = nanoid();
  db.prepare(
    'INSERT INTO relationships (id, source_id, target_id, type, properties, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, sourceId, targetId, type, JSON.stringify(properties || {}), now());

  return id;
}

export function getRelationshipsForEntity(
  db: Database.Database,
  entityId: string
): { id: string; source_id: string; target_id: string; type: string; properties: string }[] {
  return db.prepare(
    'SELECT * FROM relationships WHERE source_id = ? OR target_id = ?'
  ).all(entityId, entityId) as any[];
}

export function getRelationshipCount(db: Database.Database): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM relationships').get() as { count: number };
  return row.count;
}
```

**Verify**: Create a relationship, try creating duplicate (same source/target/type), should return same ID.

---

### Task 4.7 — Document-entity link storage

**Prerequisites**: Task 1.3
**Creates**: `src/core/document-entities.ts`

```typescript
import Database from 'better-sqlite3';

/**
 * Link a document to an entity. Ignores duplicates (UPSERT).
 */
export function linkDocumentEntity(
  db: Database.Database,
  documentId: string,
  entityId: string,
  mention: string | null = null,
  confidence: number = 1.0
): void {
  db.prepare(
    `INSERT INTO document_entities (document_id, entity_id, mention, confidence)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (document_id, entity_id) DO UPDATE SET
       mention = COALESCE(excluded.mention, document_entities.mention),
       confidence = excluded.confidence`
  ).run(documentId, entityId, mention, confidence);
}

/**
 * Remove all entity links for a document.
 */
export function clearDocumentEntities(db: Database.Database, documentId: string): void {
  db.prepare('DELETE FROM document_entities WHERE document_id = ?').run(documentId);
}
```

**Verify**: Link a doc to an entity, link again (no error), clear links.

---

### Task 4.8 — Processing pipeline (`note process`)

**Prerequisites**: Task 4.3, Task 4.4, Task 4.5, Task 4.6, Task 4.7, Task 2.5
**Creates**: `src/cli/process.ts`
**Modifies**: `src/cli/index.ts`

```typescript
import { Command } from 'commander';
import type { Config } from '../config.js';
import type Database from 'better-sqlite3';
import { getPendingDocuments, markProcessed, getAllDocuments } from '../core/documents.js';
import { extractEntities } from '../llm/extract.js';
import { extractRelationships } from '../llm/relate.js';
import { findOrCreateEntity, getAllEntities } from '../core/entities.js';
import { findOrCreateRelationship } from '../core/relationships.js';
import { linkDocumentEntity, clearDocumentEntities } from '../core/document-entities.js';

async function processDocument(
  config: Config,
  db: Database.Database,
  doc: { id: string; extracted_text: string | null; title: string | null; file_path: string | null; kind: string },
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
    console.log(`\nDone. Processed ${processedCount} documents in ${totalTime}s.`);
  });
```

Register in `src/cli/index.ts`.

**Verify**: Add entries or scan files. Run `note process`. See entities/relationships extracted. `note status` shows processed counts and entity/relationship totals.

---

## Phase 5: Entity Browsing & Search

### Task 5.1 — REPL navigation utility

**Prerequisites**: Task 1.1
**Creates**: `src/cli/repl.ts`

Shared interactive navigation loop used by `entity`, `search`, and `ask` commands.

```typescript
import * as readline from 'node:readline';

export interface NavigationItem {
  type: 'entity' | 'document';
  id: string;
  label: string;  // Display text shown in the numbered list
}

/**
 * Display a list of numbered items, then read user input in a loop.
 * Returns the selected NavigationItem, or a special action.
 */
export async function navigationRepl(
  items: NavigationItem[],
  prompt: string = 'Navigate: enter number, or (s)earch, (b)ack, (q)uit'
): Promise<{ action: 'select'; item: NavigationItem } | { action: 'search' } | { action: 'back' } | { action: 'quit' }> {
  // Display numbered items
  for (let i = 0; i < items.length; i++) {
    console.log(`  [${i + 1}] ${items[i].label}`);
  }

  console.log(`\n${prompt}`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question('> ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === 'q' || trimmed === 'quit') {
        resolve({ action: 'quit' });
      } else if (trimmed === 'b' || trimmed === 'back') {
        resolve({ action: 'back' });
      } else if (trimmed === 's' || trimmed === 'search') {
        resolve({ action: 'search' });
      } else {
        const num = parseInt(trimmed, 10);
        if (!isNaN(num) && num >= 1 && num <= items.length) {
          resolve({ action: 'select', item: items[num - 1] });
        } else {
          console.log('Invalid input.');
          resolve({ action: 'quit' });
        }
      }
    });
  });
}
```

**Verify**: Import and call with sample items. Type a number, get the right item back. Type `q`, get quit action.

---

### Task 5.2 — `note entity` command

**Prerequisites**: Task 4.5, Task 5.1
**Creates**: `src/cli/entity.ts`
**Modifies**: `src/cli/index.ts`

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { getEntityByNameOrId, searchEntities, getRelatedEntities, getDocumentsForEntity } from '../core/entities.js';
import { navigationRepl, NavigationItem } from './repl.js';
import type { EntityRow } from '../core/entities.js';

async function showEntity(db: ReturnType<typeof getDb>, entityId: string): Promise<void> {
  const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId) as EntityRow | undefined;
  if (!entity) {
    console.log('Entity not found.');
    return;
  }

  // Header
  console.log(`\n${entity.name} (${entity.type})`);
  console.log('━'.repeat(entity.name.length + entity.type.length + 3));

  const aliases: string[] = JSON.parse(entity.aliases || '[]');
  if (aliases.length > 0) {
    console.log(`Also known as: ${aliases.join(', ')}`);
  }

  // Collect navigation items
  const items: NavigationItem[] = [];

  // Related entities
  const related = getRelatedEntities(db, entity.id);
  if (related.length > 0) {
    console.log('\nRelated Entities:');
    for (const rel of related) {
      const arrow = rel.direction === 'outgoing' ? '→' : '←';
      const label = `${rel.entity.name} (${rel.entity.type}) ${arrow} ${rel.relationshipType}`;
      items.push({ type: 'entity', id: rel.entity.id, label });
    }
  }

  // Documents mentioning this entity
  const docs = getDocumentsForEntity(db, entity.id);
  if (docs.length > 0) {
    console.log('\nFound In:');
    for (const doc of docs) {
      let label: string;
      if (doc.kind === 'file' && doc.file_path) {
        // Show file path and first 80 chars of mention/content
        const preview = doc.mention || '';
        label = `${doc.file_path}${preview ? ': "' + preview.slice(0, 80) + '"' : ''}`;
      } else {
        // Entry: show date and first 80 chars
        const preview = doc.content?.slice(0, 80) || '';
        label = `(entry) ${doc.date || 'undated'}: "${preview}"`;
      }
      items.push({ type: 'document', id: doc.document_id, label });
    }
  }

  if (items.length === 0) {
    console.log('\nNo connections found.');
    return;
  }

  // Navigation loop
  const result = await navigationRepl(items);

  if (result.action === 'select') {
    if (result.item.type === 'entity') {
      await showEntity(db, result.item.id); // Recurse
    } else {
      // Show document
      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.item.id) as any;
      if (doc) {
        console.log(`\n--- ${doc.file_path || '(entry)'} ---`);
        if (doc.kind === 'file' && doc.file_path) {
          const config = loadConfig();
          const fs = await import('node:fs');
          const path = await import('node:path');
          const fullPath = path.join(config.vault.path, doc.file_path);
          try {
            console.log(fs.readFileSync(fullPath, 'utf-8'));
          } catch {
            console.log(doc.extracted_text || '(no content)');
          }
        } else {
          console.log(doc.content || '(no content)');
        }
      }
    }
  }
}

export const entityCommand = new Command('entity')
  .description('Browse an entity and its connections')
  .argument('<query>', 'entity name or ID')
  .action(async (query: string) => {
    const config = loadConfig();
    const db = getDb(config);

    // Try exact lookup first
    let entity = getEntityByNameOrId(db, query);

    if (!entity) {
      // Try fuzzy search
      const results = searchEntities(db, query);
      if (results.length === 0) {
        console.log(`No entity found matching "${query}"`);
        return;
      }
      if (results.length === 1) {
        entity = results[0];
      } else {
        // Multiple matches — let user pick
        console.log(`Multiple matches for "${query}":`);
        const items: NavigationItem[] = results.map(e => ({
          type: 'entity' as const,
          id: e.id,
          label: `${e.name} (${e.type})`,
        }));
        const pick = await navigationRepl(items, 'Pick one: enter number, or (q)uit');
        if (pick.action === 'select') {
          entity = results.find(e => e.id === pick.item.id);
        } else {
          return;
        }
      }
    }

    if (entity) {
      await showEntity(db, entity.id);
    }
  });
```

Register in `src/cli/index.ts`.

**Verify**: After processing some documents, `note entity "Main St"` shows entity with related entities and documents. Can navigate by typing numbers.

---

### Task 5.3 — `note search` command

**Prerequisites**: Task 4.5, Task 5.1
**Creates**: `src/cli/search.ts`
**Modifies**: `src/cli/index.ts`

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { searchEntities } from '../core/entities.js';
import { navigationRepl, NavigationItem } from './repl.js';

export const searchCommand = new Command('search')
  .description('Fuzzy search entities and documents')
  .argument('<query>', 'search query')
  .action(async (query: string) => {
    const config = loadConfig();
    const db = getDb(config);

    const items: NavigationItem[] = [];

    // Search entities
    const entities = searchEntities(db, query);
    if (entities.length > 0) {
      console.log('\nEntities:');
      for (const e of entities) {
        const connectionCount = db.prepare(
          'SELECT COUNT(*) as c FROM relationships WHERE source_id = ? OR target_id = ?'
        ).get(e.id, e.id) as { c: number };
        const docCount = db.prepare(
          'SELECT COUNT(*) as c FROM document_entities WHERE entity_id = ?'
        ).get(e.id) as { c: number };
        items.push({
          type: 'entity',
          id: e.id,
          label: `${e.name} (${e.type}) — ${connectionCount.c} connections, ${docCount.c} documents`,
        });
      }
    }

    // Search documents via FTS5
    let ftsQuery = query;
    // Escape FTS5 special characters
    ftsQuery = ftsQuery.replace(/['"*()]/g, '');
    if (ftsQuery.trim()) {
      try {
        const docs = db.prepare(`
          SELECT d.id, d.kind, d.file_path, d.title, d.date, d.content,
                 snippet(documents_fts, 1, '>>>', '<<<', '...', 32) as snippet
          FROM documents d
          JOIN documents_fts f ON d.rowid = f.rowid
          WHERE documents_fts MATCH ?
          ORDER BY rank
          LIMIT 10
        `).all(ftsQuery) as any[];

        if (docs.length > 0) {
          console.log('\nDocuments:');
          for (const doc of docs) {
            let label: string;
            if (doc.kind === 'file' && doc.file_path) {
              label = `${doc.file_path}: "${doc.snippet || doc.title || ''}"`;
            } else {
              label = `(entry) ${doc.date || 'undated'}: "${doc.snippet || doc.content?.slice(0, 80) || ''}"`;
            }
            items.push({ type: 'document', id: doc.id, label });
          }
        }
      } catch {
        // FTS5 query syntax error — skip
      }
    }

    if (items.length === 0) {
      console.log(`No results for "${query}"`);
      return;
    }

    const result = await navigationRepl(items);
    if (result.action === 'select' && result.item.type === 'entity') {
      // Import dynamically to avoid circular dep
      const { getEntityByNameOrId } = await import('../core/entities.js');
      const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(result.item.id);
      if (entity) {
        // Show entity (re-use entity display logic)
        const { entityCommand } = await import('./entity.js');
        // Just run showEntity directly by navigating to it
        console.log(`\nNavigating to entity...`);
        // For now, print entity ID so user can run `note entity <id>`
        console.log(`Run: note entity ${result.item.id}`);
      }
    }
  });
```

Register in `src/cli/index.ts`.

**Verify**: `note search "John"` finds matching entities and documents with snippets.

---

## Phase 6: Question Answering

### Task 6.1 — Question answering LLM prompt

**Prerequisites**: Task 4.1, Task 4.5
**Creates**: `src/llm/ask.ts`

```typescript
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
        contextText += `  ${arrow} ${rel.relationshipType}: ${rel.entity.name} (${rel.entity.type})\n`;
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
    contextText = contextText.slice(0, 16000) + '\n\n[CONTEXT TRUNCATED]';
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
```

**Verify**: With a populated graph, call `askQuestion(config, db, "how much did I spend on Main St?")`. Should return an answer string referencing entities.

---

### Task 6.2 — `note ask` command

**Prerequisites**: Task 6.1, Task 5.1
**Creates**: `src/cli/ask.ts`
**Modifies**: `src/cli/index.ts`

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';
import { askQuestion } from '../llm/ask.js';
import { navigationRepl, NavigationItem } from './repl.js';

export const askCommand = new Command('ask')
  .description('Ask a question answered from your knowledge graph')
  .argument('<question>', 'your question')
  .action(async (question: string) => {
    const config = loadConfig();
    const db = getDb(config);

    console.log('Thinking...\n');

    try {
      const result = await askQuestion(config, db, question);

      console.log(result.answer);

      // Show referenced entities as navigation items
      if (result.referencedEntityIds.length > 0) {
        console.log('\nReferenced entities:');
        const items: NavigationItem[] = [];

        for (const entityId of result.referencedEntityIds) {
          const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(entityId) as any;
          if (entity) {
            items.push({
              type: 'entity',
              id: entity.id,
              label: `${entity.name} (${entity.type})`,
            });
          }
        }

        if (items.length > 0) {
          const nav = await navigationRepl(items, 'Navigate: enter number, or (q)uit');
          if (nav.action === 'select') {
            console.log(`\nRun: note entity ${nav.item.id}`);
          }
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${msg}`);
    }
  });
```

Register in `src/cli/index.ts`.

**Verify**: `note ask "how much did I spend on the house?"` shows answer with referenced entities.

---

## Phase 7: Google Keep Import

### Task 7.1 — Google Keep file converter

**Prerequisites**: Task 1.2
**Creates**: `src/import/google-keep.ts`

```typescript
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

/**
 * Sanitize a string for use as a filename.
 * Replace non-alphanumeric chars (except dash/underscore/space) with '',
 * then replace spaces with dashes, lowercase, truncate to 80 chars.
 */
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

/**
 * Convert Google Keep Takeout JSON files to markdown files in the vault.
 * @param keepPath - Path to the Google Takeout Keep directory (contains .json files)
 * @param vaultPath - Path to the vault directory
 * @returns { created: number, skipped: number }
 */
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

    // YAML frontmatter
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
```

**Verify**: Create a fake Keep JSON file, run converter, see markdown file created with correct frontmatter and content.

---

### Task 7.2 — `note import` command

**Prerequisites**: Task 7.1
**Creates**: `src/cli/import.ts`
**Modifies**: `src/cli/index.ts`

```typescript
import { Command } from 'commander';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { convertGoogleKeep } from '../import/google-keep.js';

const importCommand = new Command('import')
  .description('Import external data into the vault');

importCommand
  .command('google-keep')
  .description('Convert Google Keep Takeout export into vault markdown files')
  .argument('<path>', 'path to Google Takeout Keep directory')
  .action((keepPath: string) => {
    const config = loadConfig();
    const resolved = path.resolve(keepPath);

    console.log(`Converting Google Keep notes from ${resolved}...`);
    const result = convertGoogleKeep(resolved, config.vault.path);

    console.log(`Created ${result.created} files in vault/keep/`);
    if (result.skipped > 0) {
      console.log(`Skipped ${result.skipped} (trashed, duplicates, or parse errors)`);
    }
    console.log(`Run \`note scan\` to index them.`);
  });

export { importCommand };
```

Register in `src/cli/index.ts`:
```typescript
import { importCommand } from './import.js';
program.addCommand(importCommand);
```

**Verify**: `note import google-keep /path/to/Keep` creates markdown files. `note scan` picks them up.

---

## Phase 8: Rebuild & Final Wiring

### Task 8.1 — `note rebuild` command

**Prerequisites**: Task 1.3
**Creates**: `src/cli/rebuild.ts`
**Modifies**: `src/cli/index.ts`

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config.js';
import { getDb } from '../core/db.js';

export const rebuildCommand = new Command('rebuild')
  .description('Delete the entire graph index and reset all documents for reprocessing')
  .action(() => {
    const config = loadConfig();
    const db = getDb(config);

    // Delete all graph data
    db.exec('DELETE FROM document_entities');
    db.exec('DELETE FROM relationships');
    db.exec('DELETE FROM entities');

    // Clear FTS tables
    db.exec("DELETE FROM entities_fts");
    db.exec("DELETE FROM documents_fts");

    // Reset all documents to pending
    db.exec("UPDATE documents SET processed = 0, error_msg = NULL");

    // Re-populate documents FTS
    db.exec(`
      INSERT INTO documents_fts(rowid, title, extracted_text)
      SELECT rowid, title, extracted_text FROM documents
    `);

    const count = (db.prepare('SELECT COUNT(*) as c FROM documents').get() as { c: number }).c;
    console.log(`Graph cleared. ${count} documents reset to pending.`);
    console.log('Run `note process` to rebuild the graph.');
  });
```

Register in `src/cli/index.ts`.

**Verify**: After building a graph, `note rebuild` clears entities/relationships. `note status` shows 0 entities, all documents pending.

---

### Task 8.2 — Wire all commands in CLI entry point

**Prerequisites**: All previous tasks
**Modifies**: `src/cli/index.ts`

Final state of `src/cli/index.ts`:

```typescript
import { Command } from 'commander';
import { initCommand } from './init.js';
import { addCommand } from './add.js';
import { scanCommand } from './scan.js';
import { processCommand } from './process.js';
import { entityCommand } from './entity.js';
import { searchCommand } from './search.js';
import { askCommand } from './ask.js';
import { importCommand } from './import.js';
import { statusCommand } from './status.js';
import { rebuildCommand } from './rebuild.js';

const program = new Command();

program
  .name('note')
  .description('AI-powered personal knowledge graph over your files')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(addCommand);
program.addCommand(scanCommand);
program.addCommand(processCommand);
program.addCommand(entityCommand);
program.addCommand(searchCommand);
program.addCommand(askCommand);
program.addCommand(importCommand);
program.addCommand(statusCommand);
program.addCommand(rebuildCommand);

program.parse();
```

**Verify**: `npx tsx src/cli/index.ts --help` shows all commands. Each command's `--help` shows its args/options.

---

## Task Dependency Graph

```
1.1 ──→ 1.2 ──→ 1.3 ──→ 1.4
  │       │       │       │
  │       │       ├──→ 1.5 (status)
  │       │       │
  ├──→ 2.1 ──→ 2.4 (scan command)
  │       │       ↑
  ├──→ 2.2 ──────┘
  │       │
  ├──→ 2.3 ──────┘
  │
  └──→ 2.5 ──→ 3.1 (add command)
         │
         ├──→ 4.8 (process command)
         │     ↑
  1.2 ──→ 4.1 (llm client)
         │
  1.1 ──→ 4.2 (json parser)
         │
  4.1+4.2→ 4.3 (entity extraction)
         │
  4.1+4.2→ 4.4 (relationship extraction)
         │
  1.3 ──→ 4.5 (entity CRUD)
         │
  1.3 ──→ 4.6 (relationship CRUD)
         │
  1.3 ──→ 4.7 (doc-entity links)
         │
  4.3+4.4+4.5+4.6+4.7+2.5 → 4.8 (process pipeline)
         │
  1.1 ──→ 5.1 (REPL utility)
         │
  4.5+5.1→ 5.2 (entity command)
         │
  4.5+5.1→ 5.3 (search command)
         │
  4.1+4.5→ 6.1 (ask LLM)
         │
  6.1+5.1→ 6.2 (ask command)
         │
  1.2 ──→ 7.1 (keep converter)
         │
  7.1 ──→ 7.2 (import command)
         │
  1.3 ──→ 8.1 (rebuild command)
         │
  ALL ──→ 8.2 (wire commands)
```

**Parallelizable groups** (tasks within each group can run simultaneously):
- Group A: 2.1, 2.2, 2.3, 2.5 (after 1.3)
- Group B: 4.1, 4.2, 4.5, 4.6, 4.7 (after 1.3)
- Group C: 5.1, 7.1 (after 1.1)
- Group D: 5.2, 5.3, 6.1 (after Group B)
