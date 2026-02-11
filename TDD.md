# Technical Design Document (TDD)

Implementation details for the goku-ai knowledge graph system. This document contains technical specifications, data models, algorithms, and configuration details.

---

## Table of Contents

1. [Processing Pipeline](#processing-pipeline)
2. [Data Model](#data-model)
3. [Multi-Pass Processing](#multi-pass-processing)
4. [Continuous Refinement](#continuous-refinement)
5. [Implementation Notes](#implementation-notes)
6. [Configuration](#configuration)
7. [Technical Decisions](#technical-decisions)
8. [Inspiration](#inspiration)

---

## Processing Pipeline

### Single-Pass Strategy (Legacy)

For simple documents, processes in one LLM call:

```
document (processed=0)
       │
       ▼
Content Extractor (file type → text)
       │
       ▼
LLM: entity extraction (text + entity hints)
       │
       ▼
Fuzzy match/create entities
       │
       ▼
LLM: relationship extraction
       │
       ▼
Mark processed=1
```

### Multi-Pass Strategy (Default)

For better accuracy, documents are processed in multiple passes with a "notebook":

```
document (processed=0)
       │
       ▼
Content Extractor → chunks (if text > 4k tokens)
       │
       ▼
PASS 1: Key Element Identification
LLM analyzes full text to identify:
  • Main topics/themes
  • Document type (daily note, receipt, project plan)
  • Key entities to look for
       │
       ▼
PASS 2: Chunk Processing with Notebook
For each chunk (max 4k tokens):
  ├─ LLM extracts entities from chunk
  ├─ Cross-reference with existing graph entities
  ├─ Update notebook with new atomic facts
  └─ Queue follow-up questions if facts are fuzzy
       │
       ▼
PASS 3: Entity Resolution & Deduplication
  ├─ Consolidate entities across chunks
  ├─ Resolve ambiguous references
  ├─ Match against existing entity aliases
  └─ Create or link entities
       │
       ▼
PASS 4: Relationship Discovery
  ├─ LLM analyzes notebook + original text
  ├─ Extract explicit relationships
  ├─ Infer implicit relationships from co-mentions
  └─ Cross-document relationship hints
       │
       ▼
PASS 5: Validation & Refinement (P1)
  ├─ LLM validates extracted graph for consistency
  ├─ Flag suspicious entities
  └─ Suggest additional context queries
       │
       ▼
Mark document processed=1, store processing_metadata
```

---

## Data Model

### Core Tables

```sql
-- Documents: metadata registry for vault files
CREATE TABLE documents (
  id          TEXT PRIMARY KEY,     -- nanoid
  file_path   TEXT UNIQUE NOT NULL, -- Relative to vault root
  file_hash   TEXT,                 -- Content hash for change detection
  file_type   TEXT,                 -- 'markdown', 'csv', 'json', etc.
  title       TEXT,                 -- From filename, frontmatter, or first line
  date        TEXT,                 -- ISO date: '2024-01-15'
  metadata    TEXT,                 -- JSON: { frontmatter: {}, tags: [], ... }
  extracted_text TEXT,              -- Text sent to LLM (cached)
  processed   INTEGER DEFAULT 0,   -- 0=pending, 1=processed, 2=error
  error_msg   TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Entities: extracted people, places, amounts, etc.
CREATE TABLE entities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,        -- person, property, expense, bill, etc.
  aliases     TEXT,                 -- JSON array of alternate names
  metadata    TEXT,                 -- JSON object for type-specific data
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

-- Relationships between entities
CREATE TABLE relationships (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,        -- payment_for, lives_at, tenant_of, etc.
  properties  TEXT,                 -- JSON for edge metadata
  created_at  TEXT NOT NULL
);

-- Links between documents and entities
CREATE TABLE document_entities (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_id   TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  mention     TEXT,                 -- Exact text span that matched
  confidence  REAL DEFAULT 1.0,
  PRIMARY KEY (document_id, entity_id)
);

-- Full-text search
CREATE VIRTUAL TABLE documents_fts USING fts5(
  title, extracted_text,
  content=documents,
  content_rowid=rowid
);

CREATE VIRTUAL TABLE entities_fts USING fts5(
  name, aliases,
  content=entities,
  content_rowid=rowid
);
```

### Extended Tables for Refinement (P1)

```sql
-- Processing metadata for transparency
CREATE TABLE processing_metadata (
  document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
  processed_at TEXT NOT NULL,
  strategy TEXT NOT NULL,
  notebook TEXT,                    -- JSON: full processing notebook
  confidence_score REAL,
  ambiguous_refs TEXT,              -- JSON array
  unresolved_mentions TEXT,         -- JSON array
  version TEXT                      -- Algorithm version
);

-- Suggested entity merges
CREATE TABLE suggested_merges (
  id TEXT PRIMARY KEY,
  entity_a_id TEXT NOT NULL REFERENCES entities(id),
  entity_b_id TEXT NOT NULL REFERENCES entities(id),
  similarity_score REAL,
  cooccurrence_count INTEGER,
  suggested_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending',    -- pending, accepted, rejected
  reviewed_at TEXT
);

-- Implicit relationships
CREATE TABLE implicit_relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  evidence TEXT,                    -- JSON: why inferred
  discovered_at TEXT NOT NULL,
  status TEXT DEFAULT 'suggested'   -- suggested, confirmed, rejected
);
```

---

## Multi-Pass Processing

### Notebook Structure

```typescript
interface ProcessingNotebook {
  keyElements: string[];
  atomicFacts: AtomicFact[];
  entities: NotebookEntity[];
  questions: FollowUpQuestion[];
  processedChunks: number[];
}

interface AtomicFact {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  sourceChunk: number;
  mentions: string[];
}

interface ProcessingMetadata {
  documentId: string;
  processedAt: string;
  strategy: 'single-pass' | 'multi-pass';
  notebook: ProcessingNotebook;
  confidence: {
    overall: number;
    entities: Record<string, number>;
    relationships: Record<string, number>;
  };
  ambiguousReferences: string[];
  unresolvedMentions: string[];
}
```

### Chunking Strategy

- Prefer semantic boundaries (paragraphs, sections)
- Overlap by ~200 tokens between chunks for continuity
- Max chunk size: 3500 tokens (leaves room for notebook context)

---

## Continuous Refinement

### Smart Relinking

Instead of reprocessing all documents, intelligently select documents for reprocessing:

**Criteria for Reprocessing:**
1. Documents with ambiguous references (e.g., "John" without clear resolution)
2. Documents mentioning entities with new aliases
3. Documents with low extraction confidence
4. Documents where entity context has changed significantly

**Implementation:**
```bash
# Reprocess only documents affected by new entity knowledge
note process --relink --smart

# Filter by specific criteria
note process --relink --filter "entity:John" --since 2024-01-01
```

### Entity Lifecycle

**Merging:**
- Fuzzy match detection (threshold: 0.85)
- Co-occurrence analysis
- User confirmation via `note merge --review`

**Splitting:**
- Context analysis to detect conflation
- LLM classification of mentions
- Creates distinct entities with provenance tracking

**Reclassification:**
- Type migration with relationship revalidation
- Linked document reprocessing with new type context

### Implicit Relationship Discovery

**Co-mention Analysis:**
- Track entity pairs appearing in same documents
- Threshold: 3+ co-mentions suggest relationship
- Confidence score based on frequency and context similarity

**Temporal Patterns:**
- Link entities mentioned across time with similar context
- Example: "mysterious investor" (Jan) → "Acme Ventures" (Jun)

---

## Implementation Notes

### Deduplication Strategy

1. **Exact name match** (case-insensitive)
2. **Alias match** — check against all existing aliases
3. **Fuzzy match** — Fuse.js threshold 0.3
4. **LLM-assisted** (P1) — for ambiguous cases

### LLM Prompts

**Entity Extraction:**
```
Extract all notable entities from text.
Return JSON array with: name, type, mentions
Types: person, property, expense, bill, organization, location, date, concept
```

**Relationship Extraction:**
```
Given text and extracted entities, extract relationships.
Return JSON array with: source, target, type
Types: payment_for, bill_for, lives_at, tenant_of, works_at, etc.
```

### Error Handling

- On LLM error: Mark document as `processed=2` with error message
- On parse error: Continue with partial results
- On timeout: Retry with exponential backoff

---

## Configuration

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

[processing]
strategy = "multi-pass"           # or "single-pass"
max_chunk_size = 3500
overlap_tokens = 200
enable_implicit_relationships = true
validation_pass = true
context_window = 4096
store_notebooks = true

[refinement]
auto_suggest_merges = true
merge_similarity_threshold = 0.85
cooccurrence_threshold = 3
smart_relink_min_entities = 10
weekly_relink_reminder = true
```

---

## Technical Decisions

### Runtime & Dependencies

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript (Node.js) | Fast iteration, good ecosystem |
| Database | better-sqlite3 | Synchronous API, native bindings |
| CLI framework | Commander.js | Mature, well-documented |
| LLM client | OpenAI SDK | Works with any OpenAI-compatible endpoint |
| Fuzzy search | Fuse.js | Client-side fuzzy matching |
| Config | TOML | Human-readable, supports comments |
| IDs | nanoid | Sortable, URL-safe, CR-SQLite compatible |

### Project Structure

```
goku-ai/
├── src/
│   ├── cli/                # Command handlers
│   ├── core/               # Database, entities, relationships
│   ├── scanner/            # File walking, hashing, extraction
│   ├── import/             # Import adapters
│   ├── llm/                # OpenAI client, extraction, Q&A
│   └── config.ts
├── migrations/             # SQL migrations
└── tests/
```

---

## Inspiration

### Laconic & GraphReader

The multi-pass approach is inspired by [Laconic](https://github.com/smhanov/laconic), which:
- Treats information as a graph of atomic facts
- Processes documents in small chunks (4k tokens)
- Accumulates a "notebook" of extracted facts
- Resolves ambiguities through iterative refinement

### The Ralph Loop

> "The Context Window is a liability... Treat it like a disposable napkin."

**Applied to goku-ai:**
1. Each pass starts with fresh context
2. Previous passes contribute only the distilled "notebook"
3. No chat history accumulates
4. Processing is deterministic and debuggable

### Why This Works for Personal Notes

Unlike web research, personal notes have:
- **High entity density**: Many people, places, events per document
- **Ambiguous references**: "John" requires context to disambiguate
- **Implicit connections**: Co-mentions reveal hidden relationships
- **Temporal context**: Recent notes help interpret current ones

---

## Testing Strategy

### Unit Tests
- Entity deduplication logic
- Fuzzy matching algorithms
- Content extraction (per file type)

### Integration Tests
- End-to-end processing pipeline
- LLM extraction accuracy
- Cross-document relationship discovery

### Benchmarks
- Processing speed (docs/minute)
- Accuracy metrics (precision/recall on entity extraction)
- Relink efficiency (% of docs reprocessed vs. accuracy gain)
