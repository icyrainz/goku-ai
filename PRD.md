# Product Requirements Document

## Overview

A CLI-first personal knowledge graph that works like a smart file system. You have a vault directory full of files — markdown notes, CSVs, JSON exports, images, whatever. The system scans them, uses a local LLM to extract entities and relationships, and builds a navigable knowledge graph on top. The files are the source of truth. The graph is a derived index.

You can also jot quick daily entries via the CLI that live in the database directly — no file overhead for "paid $150 for utilities". Both files and entries feed into the same graph.

**Prototype scope**: CLI tool with `$EDITOR` input, vault scanning, LLM-powered entity extraction, SQLite graph index, and numbered-reference entity browsing.

---

## Problem Statement

Existing note-taking tools (Obsidian, Logseq, Notion) require manual `[[wiki-links]]` to connect information. This creates two failure modes:

1. **You forget to link** — information exists but is disconnected and unfindable
2. **Linking is friction** — you stop capturing because formatting/linking is overhead

The insight: an LLM can extract entities and relationships from natural language, building the knowledge graph automatically. You just write.

---

## User Stories

### P0 — Must have for prototype

1. **As a user, I have a vault directory** (e.g. `~/notes`) that holds my files. I can symlink my Obsidian vault here, dump Google Keep exports into it, or just drop files in. The system doesn't care how files got there.

2. **As a user, I can scan my vault** by running `note scan`, which discovers all files, detects types, and queues new/changed files for processing.

3. **As a user, I can add quick daily entries** by running `note add`, which opens `$EDITOR`. These are lightweight entries stored in the database — no file created for "paid $150 for utilities".

4. **As a user, files and entries are processed the same way** — a configurable LLM (any OpenAI-compatible endpoint) extracts entities and relationships from both.

5. **As a user, I can batch-process everything** by running `note process`, which runs extraction on all unprocessed files and entries with progress output.

6. **As a user, I can browse an entity** by running `note entity <name-or-id>`, which shows the entity's details and a numbered list of related entities/sources I can navigate to.

7. **As a user, I can fuzzy search entities** by running `note search <query>`, which shows matching entities with context.

8. **As a user, I can ask a question** by running `note ask "how much did I spend on Main St?"`, which uses the LLM + knowledge graph to answer with referenced entities.

9. **As a user, I can configure the LLM endpoint** via a config file with `base_url`, `model`, and `api_key`. Default: `http://localhost:11434/v1` (Ollama).

10. **As a user, I can convert external formats into vault files** by running `note import google-keep <path>`, which converts Google Keep JSON into markdown files inside my vault.

### P1 — Important but can wait

11. **As a user, I can view today's entries** with `note today` and see all entries with their extracted entities highlighted.

12. **As a user, I can view a timeline** with `note log` showing recent entries chronologically.

13. **As a user, I can manually link entities** with `note link <entity-a> <entity-b> --type <relationship>` when the AI misses a connection.

14. **As a user, I can merge duplicate entities** with `note merge <entity-a> <entity-b>` when the AI creates duplicates.

15. **As a user, the system handles non-text files** — images via multimodal LLM descriptions, CSVs parsed as structured data, PDFs via text extraction.

### P2 — Nice to have

16. **As a user, I can pipe input** via `echo "..." | note add` for scriptable capture.

17. **As a user, I can add inline** via `note add "quick thought"` without opening an editor.

18. **As a user, I can view entity statistics** — most connected, recent, orphaned entities.

19. **As a user, I can watch the vault** for file changes and auto-queue new/modified files for processing.

---

## Architecture

### Core Concept: Files + Graph Index

```
┌──────────────────────────────────────────────────────────┐
│                    Vault Directory (~/notes)               │
│                                                            │
│  daily/2024-01-15.md    properties/123-main-st.md         │
│  receipts/jan.csv       photos/house.jpg                  │
│  keep-export/note1.md   projects/kitchen-reno.md          │
│  (anything — just files on disk)                          │
└──────────────────────────┬───────────────────────────────┘
                           │
                     note scan (detect new/changed files)
                           │
┌──────────────────────────▼───────────────────────────────┐
│                Content Extractors                         │
│  .md → passthrough     .csv → rows as text               │
│  .json → structured    .jpg/.png → multimodal LLM (P1)   │
│  .txt → passthrough    .pdf → text extraction (P1)       │
└──────────────────────────┬───────────────────────────────┘
                           │
                     extracted text
                           │
┌──────────────────────────▼───────────────────────────────┐
│              LLM (OpenAI-compatible endpoint)              │
│        Entity extraction → Relationship extraction         │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────┐
│              SQLite Graph Index (derived, rebuildable)     │
│                                                            │
│  documents ──── document_entities ──── entities            │
│  (file refs      (which doc              (people,          │
│   + quick         mentions                places,          │
│   entries)        which entity)           amounts...)      │
│                                                            │
│                   relationships                            │
│                  (entity ↔ entity)                         │
│                                                            │
│  FTS5 indexes for full-text search                        │
└──────────────────────────────────────────────────────────┘
```

**Key principle**: The vault files are the source of truth. The SQLite database is a derived index — you could delete it and rebuild the entire graph by re-scanning and re-processing the vault. Quick daily entries (via `note add`) are the one exception: they live in the database since they don't warrant individual files.

### LLM Integration

The LLM is used for three distinct tasks, each with its own system prompt:

1. **Entity Extraction** — Given document text, extract structured entities:
   ```
   Input: "Paid $150 for utility bill for the house on 123 Main St"
   Output: [
     { "name": "123 Main St", "type": "property", "mentions": ["the house on 123 Main St"] },
     { "name": "Utility Bill", "type": "bill", "mentions": ["utility bill"] },
     { "name": "$150", "type": "expense", "mentions": ["$150"] }
   ]
   ```

2. **Relationship Extraction** — Given entities in context, extract relationships:
   ```
   Output: [
     { "source": "$150", "target": "Utility Bill", "type": "payment_for" },
     { "source": "Utility Bill", "target": "123 Main St", "type": "bill_for" }
   ]
   ```

3. **Question Answering** — Given a question + relevant graph context, generate an answer with entity references.

**Configuration** (`~/.config/note-taker/config.toml`):
```toml
[vault]
path = "~/notes"  # vault directory

[llm]
base_url = "http://localhost:11434/v1"  # Ollama default
model = "mistral"                        # or any model name
api_key = ""                             # optional, for hosted APIs

[llm.extraction]
model = ""  # override model for extraction (optional, falls back to llm.model)

[llm.ask]
model = ""  # override model for question answering (optional)
```

### Data Model

SQLite via `better-sqlite3`. This is a **graph index over your files**, not a content store.

```sql
-- Documents: references to vault files + inline quick entries
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,     -- nanoid
  kind        TEXT NOT NULL,        -- 'file' or 'entry'

  -- For kind='file': pointer to vault file (content lives on disk)
  file_path   TEXT UNIQUE,          -- Relative to vault root: 'daily/2024-01-15.md'
  file_hash   TEXT,                 -- Content hash for change detection (e.g. xxhash)
  file_type   TEXT,                 -- Detected type: 'markdown', 'csv', 'json', 'image', etc.

  -- For kind='entry': content lives here (quick daily notes)
  content     TEXT,                 -- Only populated for kind='entry'

  -- Shared fields
  title       TEXT,                 -- From filename, frontmatter, or first line
  date        TEXT,                 -- ISO date: '2024-01-15'
  metadata    TEXT,                 -- JSON: { frontmatter: {}, tags: [], ... }
  extracted_text TEXT,              -- Text sent to LLM (from content extractor). Cached to avoid re-extraction.
  processed   INTEGER DEFAULT 0,   -- 0=pending, 1=processed, 2=error
  error_msg   TEXT,                 -- Error detail if processed=2
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Entities: extracted people, places, amounts, etc.
CREATE TABLE entities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,        -- Display name: "123 Main St"
  type        TEXT NOT NULL,        -- person, property, expense, bill, organization, location, concept
  aliases     TEXT,                 -- JSON array of alternate names/mentions
  metadata    TEXT,                 -- JSON object for type-specific data
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Relationships between entities
CREATE TABLE relationships (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,        -- payment_for, lives_at, tenant_of, works_at, etc.
  properties  TEXT,                 -- JSON for edge metadata (amount, date, etc.)
  created_at  TEXT NOT NULL
);

-- Links between documents and entities (many-to-many)
CREATE TABLE document_entities (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  mention     TEXT,                 -- The exact text span that matched
  confidence  REAL DEFAULT 1.0,    -- LLM confidence score
  PRIMARY KEY (document_id, entity_id)
);

-- Full-text search on extracted text + quick entries
CREATE VIRTUAL TABLE documents_fts USING fts5(
  title, extracted_text,
  content=documents,
  content_rowid=rowid
);

-- Full-text search on entities
CREATE VIRTUAL TABLE entities_fts USING fts5(
  name, aliases,
  content=entities,
  content_rowid=rowid
);

-- Indexes
CREATE INDEX idx_documents_kind ON documents(kind);
CREATE INDEX idx_documents_file_path ON documents(file_path);
CREATE INDEX idx_documents_processed ON documents(processed);
CREATE INDEX idx_documents_date ON documents(date);
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_relationships_source ON relationships(source_id);
CREATE INDEX idx_relationships_target ON relationships(target_id);
CREATE INDEX idx_document_entities_doc ON document_entities(document_id);
CREATE INDEX idx_document_entities_entity ON document_entities(entity_id);
```

**Design rationale:**
- `documents` table is a **registry**, not a content store. For files, content lives on disk. The DB just tracks what's been scanned and processed.
- `kind='file'` vs `kind='entry'` — files reference the vault, entries store content inline. Both produce entities the same way.
- `file_hash` enables change detection: `note scan` compares hashes to find modified files and requeues them.
- `extracted_text` caches the content extractor output so we don't re-parse files on every query (e.g. CSV parsing, frontmatter stripping).
- `file_path` is relative to vault root — vault can be moved without breaking the index.
- The entire graph (entities, relationships, document_entities) is derived and rebuildable: `note rebuild` could nuke the graph and reprocess everything from files + entries.
- Text PKs (nanoid) for future CR-SQLite compatibility.

---

## CLI Interface

### Commands

```
note init [path]                  Initialize a vault (default: ~/notes)
note add                          Open $EDITOR for a quick daily entry (stored in DB)
note scan                         Scan vault for new/changed files, queue for processing
note process [--concurrency N]    Run LLM extraction on all pending documents
note process --relink             Reprocess all docs with current entity knowledge (retroactive linking)
note entity <name-or-id>          Browse an entity and its connections
note search <query>               Fuzzy search entities and documents
note ask "<question>"             Ask a question answered from the knowledge graph
note import google-keep <path>    Convert Google Keep export into vault markdown files
note status                       Show vault/processing/graph stats
note rebuild                      Nuke the graph index and reprocess everything from scratch
note today                        Show today's entries with extracted entities (P1)
note log [--days N]               Show recent entries chronologically (P1)
note link <a> <b> [--type T]      Manually create a relationship (P1)
note merge <a> <b>                Merge duplicate entities (P1)
note add "quick note"             Add inline entry (P2)
note config                       Show current configuration (P2)
```

### Output Format — Entity Browsing

When viewing an entity, show a numbered reference list for navigation:

```
$ note entity "123 Main St"

🏠 123 Main St (property)
━━━━━━━━━━━━━━━━━━━━━━━━━━

Related Entities:
  [1] Utility Bill (bill) ── payment_for ── $150
  [2] John Doe (person) ── tenant_of
  [3] Home Insurance (bill) ── policy_for

Found In:
  [4] daily/2024-01-15.md: "Paid $150 for utility bill for the house on 123 Main St"
  [5] daily/2024-01-10.md: "John Doe moved into 123 Main St"
  [6] (entry) 2024-01-03: "Renewed home insurance for Main St property"

Navigate: enter number, or (s)earch, (b)ack, (q)uit
> _
```

This creates a REPL-like navigation loop where you can follow connections through the graph.

### Output Format — Search

```
$ note search "Main"

Entities:
  [1] 123 Main St (property) — 6 connections, 3 documents
  [2] Main Street Deli (organization) — 2 connections, 1 document

Documents:
  [3] daily/2024-01-15.md: "Paid $150 for utility bill for the house on 123 Main St"
  [4] daily/2024-01-10.md: "John Doe moved into 123 Main St"

Navigate: enter number, or (q)uit
> _
```

### Output Format — Ask

```
$ note ask "how much have I spent on the house?"

Based on your notes, you've spent $150 on 123 Main St:

  • $150 — Utility Bill (2024-01-15) [1]

Referenced entities:
  [1] 123 Main St (property)
  [2] Utility Bill (bill)

Navigate: enter number, or (q)uit
> _
```

---

## Vault Scanning & Import

### `note scan` — Discover files in the vault

```
note scan
```

- Recursively walks the vault directory
- For each file:
  - Computes content hash (xxhash — fast, good enough)
  - Checks `documents` table by `file_path`
  - **New file**: insert with `processed=0`
  - **Changed file** (hash differs): update hash, reset `processed=0`, clear old entity links
  - **Unchanged file**: skip
  - **Deleted file** (in DB but not on disk): mark as removed, clean up entity links
- Skips hidden directories (`.obsidian/`, `.git/`, etc.)
- Shows progress:
  ```
  Scanning vault... 1,203 files found
  ✓ 847 unchanged, 312 new, 44 modified
  Run `note process` to extract entities from 356 pending documents
  ```

**Obsidian compatibility**: If your vault IS an Obsidian vault (or symlinked), `note scan` just works. No special import needed. `[[wiki-links]]` in content become entity hints during extraction.

### `note import` — Convert external formats into vault files

Import doesn't load data into the database — it converts external formats into files in your vault. Then `note scan` + `note process` handle the rest.

```
note import google-keep /path/to/Takeout/Keep
```

- Reads `.json` files from Google Takeout
- Converts each to a markdown file in `vault/keep/` subdirectory
- Maps Keep fields:
  - `textContent` or `listContent` → markdown body (lists as `- [ ]` checklists)
  - `title` → YAML frontmatter `title` + filename
  - `createdTimestampUsec` → frontmatter `date`
  - `labels[].name` → frontmatter `tags`
  - `annotations` (URLs) → appended to body
  - Skips trashed notes
- Idempotent: won't overwrite existing files (checks by filename)
- After conversion: "Created 333 files in vault/keep/. Run `note scan` to index them."

Future importers (Apple Notes, Notion export, etc.) follow the same pattern: convert to files, drop into vault.

### `note status`

```
$ note status

Vault:       ~/notes (1,203 files)
Entries:     23 quick entries

Processing:
  ✓ Processed:  234
  ⏳ Pending:    961
  ✗ Errored:      8

Graph:
  Entities:      412 (person: 45, property: 12, expense: 89, bill: 34, ...)
  Relationships: 287
```

---

## Processing Pipeline

### `note process` — Extract entities from pending documents

```
note process [--concurrency N]
```

This is the core of the system. It takes unprocessed documents (files + entries), extracts text, runs the LLM, and builds the graph index.

### Flow

```
document (processed=0)
       │
       ▼
Content Extractor (file type → text)
  .md  → strip frontmatter, passthrough body
  .csv → format rows as readable text
  .json → flatten to key-value descriptions
  .txt  → passthrough
  .jpg/.png → multimodal LLM describe (P1)
  .pdf  → text extraction (P1)
       │
       ▼
extracted_text stored in documents table (cached)
       │
       ▼
LLM: entity extraction prompt
(text + existing entity list for dedup hints)
       │
       ▼
For each extracted entity:
  ├─ Fuzzy match against existing entities (name + aliases)
  ├─ If match found (score > threshold): link to existing
  ├─ If no match: create new entity
  └─ Insert into document_entities with mention text
       │
       ▼
LLM: relationship extraction prompt
(text + extracted entities as context)
       │
       ▼
For each relationship:
  └─ Upsert into relationships (deduplicate by source+target+type)
       │
       ▼
Mark document processed=1
```

### Progress output

```
Processing... [234/1,203] 19% ── ETA: ~12 min
✓ daily/2024-01-15.md → 3 entities, 2 relationships
✓ keep/grocery-list.md → 1 entity, 0 relationships
✗ keep/untitled.md → error: empty content (skipped)
```

- On error: marks `processed=2` with `error_msg`, continues to next
- Resumable: re-running picks up where it left off (only `processed=0`)
- Concurrency default: 1 (local LLMs are typically single-threaded)

### Retroactive Relinking (`note process --relink`)

Over time, new entities emerge that should connect to older documents. Example: you mention "John" casually in January. In June you write "John Doe, tenant at 123 Main St" — now the system has a `John Doe (person)` entity. That January mention should link to it.

```
note process --relink
```

- Reprocesses ALL documents (regardless of processed status)
- Passes the **current full entity list** as context to the LLM, so it can match old mentions to newly-known entities
- Clears and rebuilds entity links for each document
- Preserves manually-created links (P1)
- Expensive (re-runs LLM on everything) but needed periodically as the graph grows

**When to relink:**
- After a large import (many new entities discovered)
- When you notice old references that should be connected
- Periodically as the entity vocabulary grows
- Anytime — since extraction runs on a local LLM, reprocessing is free. You can iterate as many times as needed to improve the graph without paying per-token cloud costs.

### `note rebuild` — Nuclear option

```
note rebuild
```

- Deletes all entities, relationships, and document_entities
- Resets all documents to `processed=0`
- Equivalent to: starting fresh with the same vault
- Use when: extraction prompts improved, switched LLM models, graph is messy
- Free to run since everything is local — no cloud token costs. Swap to a better model, rebuild, compare results.

### Entity Types (initial set)

| Type | Examples |
|------|----------|
| `person` | John Doe, Dr. Smith, Mom |
| `property` | 123 Main St, the house, the apartment |
| `expense` | $150, $2,500/month |
| `bill` | utility bill, insurance, mortgage |
| `organization` | Acme Corp, City Water Department |
| `location` | San Francisco, downtown, the office |
| `date` | January 15, next Tuesday, Q1 2024 |
| `concept` | project launch, kitchen renovation |

Users should not need to pre-define types — the LLM infers them. But the system provides this list as guidance in the extraction prompt.

### Deduplication Strategy

Before creating a new entity, check for duplicates:

1. **Exact name match** (case-insensitive)
2. **Alias match** — check against all existing aliases
3. **Fuzzy match** — Levenshtein distance or similar on entity names of the same type
4. **LLM-assisted** (P1) — for ambiguous cases, ask the LLM "are these the same entity?"

For the prototype, start with exact + fuzzy matching. LLM-assisted dedup is P1.

---

## Technical Decisions

### Runtime & Dependencies

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript (Node.js) | Fast iteration, good ecosystem, path to future web UI |
| Database | better-sqlite3 | Synchronous API (simpler code), fast, native SQLite bindings |
| CLI framework | Commander.js or yargs | Mature, well-documented |
| LLM client | OpenAI SDK (`openai` npm package) | Works with any OpenAI-compatible endpoint |
| Fuzzy search | fuse.js or fzf-like scoring | For entity name matching |
| Config | cosmiconfig or rc | Standard config file loading |
| IDs | nanoid or ulid | Sortable, URL-safe, no autoincrement (CR-SQLite compatible) |

### Project Structure

```
note-taker/
├── src/
│   ├── cli/                # Command handlers
│   │   ├── init.ts
│   │   ├── add.ts
│   │   ├── scan.ts
│   │   ├── process.ts
│   │   ├── entity.ts
│   │   ├── search.ts
│   │   ├── ask.ts
│   │   ├── import.ts
│   │   ├── status.ts
│   │   └── index.ts        # CLI entry point, command registration
│   ├── core/
│   │   ├── db.ts            # SQLite setup, migrations, queries
│   │   ├── documents.ts     # Document registry (files + entries)
│   │   ├── entities.ts      # Entity CRUD, dedup, graph traversal
│   │   └── relationships.ts
│   ├── scanner/
│   │   ├── scan.ts          # Vault file discovery, hash comparison
│   │   └── extractors.ts   # Content extractors: .md, .csv, .json, .txt
│   ├── import/
│   │   └── google-keep.ts   # Google Keep → markdown file converter
│   ├── llm/
│   │   ├── client.ts        # OpenAI-compatible API client
│   │   ├── extract.ts       # Entity extraction prompts & parsing
│   │   ├── relate.ts        # Relationship extraction prompts & parsing
│   │   └── ask.ts           # Question answering with graph context
│   ├── config.ts            # Config file loading
│   └── utils.ts
├── migrations/              # SQL migration files
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

---

## Success Criteria (Prototype)

The prototype is successful when:

1. I can point it at my Obsidian vault (or any folder of files) and `note scan` indexes everything
2. I can convert my Google Keep export into vault files with `note import google-keep`
3. I can run `note process` and watch it extract entities from hundreds of files via a local LLM
4. I can run `note add`, write a quick entry, and see extracted entities
5. I can run `note entity "123 Main St"` and see all related entities and source files
6. I can run `note search "John"` and find entities/documents fuzzy-matched
7. I can run `note ask "how much did I spend on the house?"` and get a coherent answer from the graph
8. Entities are deduplicated reasonably ("123 Main St" and "the house on Main St" should merge)
9. `note process --relink` retroactively connects old documents to newly-discovered entities
10. My files stay as files — the SQLite DB is a derived index I could delete and rebuild
11. The LLM endpoint is configurable — works with Ollama, llama.cpp, or any OpenAI-compatible API

---

## Non-Goals (Prototype)

- No GUI / desktop app / web UI
- No sync / multi-device
- No mobile
- No plugin system
- No real-time extraction (process on demand via `note process`, not on file save)
- No user accounts or multi-user
- No vector/semantic search (FTS5 is enough for now)
- No image/PDF processing (text-based files only: .md, .txt, .csv, .json)
- No web clipper
- No file watching (manual `note scan` for now; P2 for fs watcher)

---

## Open Questions

1. **Extraction prompt tuning** — How much prompt engineering is needed to get reliable structured output from different local LLMs? Should we use JSON mode / function calling?

2. **Entity merging UX** — When the system detects a potential duplicate, should it auto-merge (with undo) or ask for confirmation? Prototype: auto-merge with a log.

3. **Graph depth for `note ask`** — How many hops of context to include when answering questions? Start with 2 hops and tune.

4. **Relink frequency** — How often should `--relink` run? Could track a "last_relinked_at" timestamp and suggest relinking when many new entities have been added since.

5. **Large file handling** — What's the cutoff for sending a file's text to the LLM? Truncate? Chunk and merge? Start simple: truncate to model's context window with a warning.
