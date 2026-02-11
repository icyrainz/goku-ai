# Agent Guidelines for goku-ai

AI-powered personal knowledge graph CLI tool built with TypeScript, SQLite, and LLM integration.

## Build/Lint/Test Commands

```bash
# Run tests (vitest)
npm test

# Run a single test file
npx vitest run tests/llm.test.ts

# Run tests in watch mode
npx vitest

# TypeScript type check
npm run typecheck
# or: npx tsc --noEmit

# Build/compile TypeScript
npm run build
# or: npx tsc

# Run CLI in development mode
npm run dev -- <command>
# or: npx tsx src/cli/index.ts <command>

# Justfile shortcuts (requires `just` installed)
just test          # Run tests
just typecheck     # Type check
just init          # Initialize vault
just scan          # Scan vault for changes
just process       # Process pending documents
just daily         # Open today's daily note
```

## Code Style Guidelines

### TypeScript

- **Target**: ES2022 with Node16 module resolution
- **Strict mode**: Enabled - no implicit any, strict null checks, etc.
- **Module system**: ES modules (`"type": "module"` in package.json)

### Imports

```typescript
// 1. External dependencies first (alphabetical)
import { Command } from 'commander';
import Database from 'better-sqlite3';

// 2. Node built-ins with `node:` prefix
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// 3. Internal imports (relative paths)
import { loadConfig } from '../config.js';  // Note: .js extension required
import { getDb } from '../core/db.js';
```

### Naming Conventions

- **Variables/functions**: camelCase (`getDb`, `findOrCreateEntity`)
- **Types/interfaces**: PascalCase (`EntityRow`, `ExtractedEntity`)
- **Constants**: UPPER_SNAKE_CASE for true constants (`ENTITY_EXTRACTION_SYSTEM_PROMPT`)
- **Files**: kebab-case for multi-word files (`document-entities.ts`)
- **Database columns**: snake_case (`created_at`, `file_path`)

### Types

```typescript
// Prefer interfaces for object shapes
export interface EntityRow {
  id: string;
  name: string;
  type: string;
  aliases: string;  // JSON array string
}

// Use explicit return types on public functions
export function getDb(config: Config): Database.Database { }

// Use type imports when possible
import type { Config } from '../config.js';
```

### Error Handling

```typescript
// Use try/catch for async operations
async function loadData(): Promise<Data> {
  try {
    const result = await fetchData();
    return result;
  } catch (error) {
    console.error('Failed to load data:', error);
    throw error; // Re-throw or return default
  }
}

// For operations that can fail gracefully, return empty/default values
try {
  return parse(content);
} catch {
  return {}; // Silent fallback
}
```

### Database Patterns

```typescript
// Use better-sqlite3 synchronous API
const result = db.prepare('SELECT * FROM entities WHERE id = ?').get(id);

// Parameterized queries (always use placeholders)
db.prepare('INSERT INTO entities (id, name) VALUES (?, ?)').run(id, name);

// Transactions for multiple operations
const insert = db.transaction((items) => {
  for (const item of items) {
    insertStmt.run(item);
  }
});
```

### Formatting

- 2-space indentation
- Single quotes for strings
- Semicolons required
- Max ~100 chars per line
- Trailing commas in multi-line objects/arrays

```typescript
const config: Config = {
  vault: { path: '~/notes' },
  llm: {
    baseUrl: 'http://localhost:11434/v1',
    model: 'mistral',
  },
};
```

### Comments

- JSDoc for public functions and complex logic
- Inline comments for non-obvious code only
- Keep comments concise

```typescript
/**
 * Find an existing entity or create a new one.
 * Dedup strategy: exact match → alias match → fuzzy match → create new
 */
export function findOrCreateEntity(db: Database.Database, name: string, type: string): string { }
```

### CLI Commands

Commands are organized in `src/cli/` and registered in `src/cli/index.ts`:

```typescript
export const myCommand = new Command('mycommand')
  .description('What this command does')
  .argument('<required>', 'Description')
  .option('-f, --flag', 'Description')
  .action(async (arg, options) => {
    const config = loadConfig();
    const db = getDb(config);
    // Implementation
  });
```

### Project Structure

```
src/
  cli/          # Commander CLI commands
  core/         # Database, entities, documents, relationships
  llm/          # OpenAI client, entity extraction, Q&A
  scanner/      # File walking, hashing, extraction
  import/       # Import adapters (Google Keep, etc.)
```

### Environment & Config

Configuration loads from (priority order):
1. Environment variables (NOTE_VAULT_PATH, NOTE_LLM_*)
2. Local `app.config.toml`
3. Global `~/.config/my-app/config.toml`
4. Built-in defaults

Always use `loadConfig()` to get configuration.

### Testing

- Vitest for testing framework
- Tests live in `tests/` directory
- Integration tests may use actual database/LLM
- Use `.js` extension in imports even for `.ts` files
