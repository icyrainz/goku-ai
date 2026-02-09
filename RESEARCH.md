# Research & Market Analysis

## Vision

A fully self-hosted, AI-powered personal knowledge graph note-taking app. The core idea: write unstructured daily log entries, and the system automatically extracts entities (people, places, amounts, bills, dates, properties) and builds a navigable knowledge graph with wiki-style backlinks.

**Example flow:**
> "Paid $150 for utility bill for the house on 123 Main St"

Auto-extracts:
- **Date**: linked to daily log timeline
- **$150**: tracked as expense, linked to spending history
- **Utility bill**: linked to all bill entities
- **House (123 Main St)**: linked to property entity with all payments, tenants, insurance, etc.

Each entity becomes a hyperlink. Click "house" → see address, bills, tenants, insurance. Click tenant → see phone number, messages exchanged. Everything interconnected like a personal wiki/mind map.

---

## Market Landscape

### What Exists Today

| Tool | Entity Extraction | Self-Hosted | Vim | Mobile | Graph View | Sync | Status |
|------|:-:|:-:|:-:|:-:|:-:|:-:|--------|
| **Tana** | AI-assisted (supertags) | No (cloud-only) | No | No | Yes | Cloud | Active, VC-funded |
| **Mem.ai** | Auto AI linking | No (cloud-only) | No | Yes | No | Cloud | Active |
| **Reor** | Semantic (vector similarity) | Yes (local) | No | No | No | No | Active, open-source |
| **Obsidian** | Manual `[[links]]` only | Yes (local files) | Plugin | Yes (paid sync) | Yes | Paid/plugins | Dominant, 1M+ users |
| **Logseq** | Manual `[[links]]` only | Yes (local files) | No | Beta | Yes | Git/custom | Active, open-source |
| **Trilium Notes** | Manual | Yes (self-hosted server) | No | Web only | Relation maps | Built-in server sync | Active, open-source → TriliumNext fork |
| **SiYuan** | Manual | Yes (local + sync) | No | Yes | Yes | S3/WebDAV | Active, Chinese origin |
| **Anytype** | Manual (objects/relations) | Yes (P2P) | No | Yes | Yes | P2P (any-sync) | Active, open-source |
| **Affine** | Manual | Yes (self-hosted option) | No | Beta | Partial | Cloud/self-host | Active, early stage |
| **Dendron** | Manual (hierarchy schemas) | Yes (VS Code) | VS Code vim | No | Yes | Git | Maintenance mode |
| **Foam** | Manual | Yes (VS Code) | VS Code vim | No | Yes | Git | Low activity |
| **Notion** | Manual | No (cloud-only) | No | Yes | No | Cloud | Dominant, 100M+ users |

### Key Insight

**Nobody has built what we want.** The technology exists (LLMs for entity extraction, graph databases, CRDTs for sync), but no one has packaged it into a self-hosted personal knowledge graph with automatic entity extraction. This is a genuine gap.

The closest tools:
1. **Tana** — best entity/supertag system, but cloud-only, no vim, vendor lock-in
2. **Mem.ai (Mem0)** — best auto AI linking, but cloud-only, proprietary
3. **Reor** — open-source with local LLM, but links whole notes by vector similarity, not discrete entities
4. **Trilium/Logseq** — best self-hosted foundations, but zero auto-extraction

---

## Lessons from the Graveyard

### Failed Projects & Why

**Athens Research** — Raised $1.9M, built Clojure-based Roam clone, shut down after spending ~$850K.
- Mistake: chose Clojure/ClojureScript (small talent pool, hard to hire)
- Mistake: tried to compete on features with Roam rather than differentiating
- Mistake: open-source business model never found revenue
- Lesson: **technology choices matter for sustainability; differentiation matters more than feature parity**

**Roam Research** — Pioneer of bidirectional links, early hype, then stagnation.
- Built on Clojure/Datomic, proprietary cloud-only
- $15/month pricing pushed users to free alternatives
- Slow iteration, reliability issues, no mobile for too long
- Obsidian and Logseq ate their lunch with local-first + free tiers
- Lesson: **local-first wins; speed of iteration wins; pricing must match value**

**Evernote** — Once dominant (250M+ users), died slowly.
- Feature creep: added presentations, chat, business tools
- Lost focus on core note-taking speed and reliability
- Lesson: **never sacrifice core speed for features**

**Dendron** — VC-funded, VS Code-based hierarchical notes.
- Too coupled to VS Code (no standalone app)
- Hierarchy-first approach didn't resonate vs graph-first tools
- Went to maintenance mode
- Lesson: **platform dependency is risky; don't force a paradigm**

### What Makes Winners Win

**Obsidian** (2 founders, zero VC, 1M+ users):
- Local Markdown files (your data, forever)
- Instant speed (Electron but optimized)
- Plugin ecosystem (1800+ plugins)
- Vim mode built-in
- Paid sync is optional, not required
- Lesson: **own your data + speed + extensibility = trust**

**Notion** (100M+ users):
- Block-based architecture (everything composable)
- Progressive disclosure (simple surface, power underneath)
- Beautiful defaults (works great without configuration)
- Lesson: **low friction for new users, depth for power users**

### Anti-Patterns to Avoid

1. **Over-engineering the graph** — Make capture frictionless first, graph second
2. **Neglecting mobile** — Quick capture on phone is non-negotiable
3. **Poor sync reliability** — Data loss = instant trust destruction
4. **Feature creep** — Do capture + linking brilliantly before adding anything else
5. **Building in isolation** — Validate with real daily use from day one
6. **Complex onboarding** — Must be useful in 30 seconds, not 30 minutes

### Design Principles (from Zettelkasten methodology)

1. **Atomicity** — One idea per note, but we extend this to one entity per node
2. **Connectivity** — Notes gain value through links, not folders
3. **Organic structure** — Don't predefine categories; let structure emerge from content
4. **Low friction capture** — If it's hard to add a note, you won't do it

---

## Technical Architecture

### Recommended Stack

```
+------------------+     +------------------+     +------------------+
|   Desktop App    |     |   Mobile App     |     |  Web Clipper     |
|   (Tauri v2)     |     |   (React Native  |     |  (Manifest V3   |
|                  |     |    + Expo)        |     |   Extension)     |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
    SQLite + CR-SQLite       expo-sqlite +            Defuddle +
    + FTS5 + sqlite-vec      CR-SQLite + FTS5         Turndown
         |                        |                        |
         +----------+-------------+----------+-------------+
                    |                        |
              [Sync Layer: CR-SQLite changesets, E2E encrypted]
                    |
         +----------+------------------------+
         |   Self-Hosted Sync Server          |
         |   (Lightweight REST or CouchDB)    |
         |   + S3/MinIO for media/PDFs        |
         +------------------------------------+
                    |
         +----------+------------------------+
         |   NLP Pipeline (runs on device)    |
         |   GLiNER: Real-time entity extract |
         |   Triplex/Ollama: Relationship     |
         |   extraction (batch)               |
         +------------------------------------+
```

### Layer 1: Database — SQLite Everywhere

**Why SQLite over Neo4j/SurrealDB:**
- Runs on every platform (desktop, mobile, browser via WASM)
- Zero configuration, embedded, single-file
- FTS5 for full-text search built-in
- sqlite-vec for vector/semantic search
- CR-SQLite for CRDT-based sync
- Billions of deployments, battle-tested
- Graph queries via recursive CTEs work fine at personal scale (<100K nodes)

**Schema design:**

```sql
-- Core entity/node storage
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,        -- 'note', 'person', 'property', 'bill', 'expense', etc.
  title TEXT,
  content TEXT,              -- Markdown content for notes
  metadata JSON,             -- Flexible structured data
  created_at INTEGER,
  updated_at INTEGER
);

-- Relationships between entities
CREATE TABLE edges (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES nodes(id),
  target_id TEXT REFERENCES nodes(id),
  type TEXT NOT NULL,         -- 'mentions', 'paid_for', 'lives_at', 'tenant_of', etc.
  properties JSON,            -- e.g., {"amount": 150, "date": "2024-01-15"}
  created_at INTEGER
);

-- Full-text search index
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  title, content, content=nodes, content_rowid=rowid
);

-- Vector embeddings for semantic search
CREATE VIRTUAL TABLE nodes_vec USING vec0(
  id TEXT PRIMARY KEY,
  embedding float[384]       -- sentence-transformer dimensions
);

-- Daily log entries (the primary input interface)
CREATE TABLE daily_log (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,         -- '2024-01-15'
  content TEXT,               -- Raw markdown entry
  processed BOOLEAN DEFAULT 0,
  node_id TEXT REFERENCES nodes(id),
  created_at INTEGER
);

-- File attachments (PDFs, images, etc.)
CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  node_id TEXT REFERENCES nodes(id),
  filename TEXT,
  mime_type TEXT,
  storage_path TEXT,          -- Local path or S3 key
  metadata JSON,              -- Extracted text, page count, etc.
  created_at INTEGER
);
```

**Graph traversal example:**

```sql
-- "Show me everything related to the house at 123 Main St"
WITH RECURSIVE connected(id, depth, path) AS (
  SELECT id, 0, id FROM nodes WHERE title LIKE '%123 Main St%'
  UNION ALL
  SELECT e.target_id, c.depth + 1, c.path || '→' || e.target_id
  FROM edges e JOIN connected c ON e.source_id = c.id
  WHERE c.depth < 3
)
SELECT n.*, c.depth, c.path
FROM nodes n JOIN connected c ON n.id = c.id
ORDER BY c.depth;
```

### Layer 2: Entity Extraction — Two-Stage Pipeline

**Stage 1: Fast extraction (real-time as you type)**

Using **GLiNER** — a lightweight BERT-based model for zero-shot Named Entity Recognition:
- Runs on CPU, fast enough for real-time
- You define entity types: `["person", "property", "amount", "bill_type", "organization", "date", "location"]`
- Extracts entities without fine-tuning
- ~50ms per note on modern hardware

**Stage 2: Relationship extraction (batch, on save)**

Using **Triplex** (via Ollama) — a 3.8B parameter model purpose-built for knowledge graph construction:
- Extracts subject-predicate-object triples
- Example: "Paid $150 for utility bill for 123 Main St" →
  - (user, paid, $150)
  - ($150, payment_for, utility_bill)
  - (utility_bill, for_property, 123_Main_St)
- Runs locally via Ollama, ~2-5 seconds per note
- Comparable to GPT-4 quality at 98% lower cost

**Alternative/fallback:**
- **spaCy** — traditional NLP, very fast, no GPU needed, but extracts entities only (not relationships)
- **General LLM prompt** — Mistral 7B or Llama 3 8B via Ollama for custom extraction prompts

**Entity deduplication:**
- Fuzzy matching (Levenshtein distance) to link "123 Main St" with "the house on Main Street"
- Vector similarity via sqlite-vec embeddings
- User confirmation for ambiguous matches

### Layer 3: Sync — CR-SQLite + E2E Encryption

**Why CR-SQLite:**
- Adds CRDT (Conflict-free Replicated Data Type) columns to existing SQLite tables
- Each device has a full local copy — works completely offline
- Changes sync as compressed deltas
- Automatic merge without conflicts (last-write-wins per column)
- ~2.5x insert overhead (acceptable for personal use)

**Sync architecture:**
```
Device A (SQLite + CR-SQLite)
    ↕ E2E encrypted changesets
Self-hosted sync server (CouchDB or simple REST API)
    ↕ E2E encrypted changesets
Device B (SQLite + CR-SQLite)
```

**Encryption:**
- AES-256 encryption on changesets before leaving device
- Sync server stores only encrypted blobs — cannot read your data
- Decryption key derived from user passphrase (never sent to server)

**Media sync:**
- Large files (PDFs, images) stored in S3-compatible storage (MinIO self-hosted)
- Only metadata and references stored in SQLite
- Media synced separately with content-addressable hashing

### Layer 4: Clients

**Desktop — Tauri v2**
- Rust-based, much lighter than Electron (~10MB vs ~150MB)
- Native SQLite access
- Runs Ollama/LLM locally for entity extraction
- Vim keybindings via CodeMirror 6 + vim extension
- System tray for quick capture

**Mobile — React Native + Expo**
- `expo-sqlite` with CR-SQLite integration
- Share sheet integration (share from any app → goku-ai)
- Offline-first, background sync
- Quick capture widget
- Entity extraction runs on device (GLiNER is lightweight enough) or deferred to desktop/server

**Web Clipper — Manifest V3 Browser Extension**
- **Defuddle** (by Obsidian's creator) for content extraction — better than Readability.js
- **Turndown** for HTML → Markdown conversion
- Schema.org / Open Graph metadata extraction
- Sends clipped content to app via local API
- App runs entity extraction on clipped content

### Layer 5: Rich Text Editor

**CodeMirror 6** with:
- Vim keybindings (first-class, not afterthought)
- Markdown live preview
- `[[wiki-link]]` autocomplete from entity graph
- Inline entity highlighting (detected entities shown as chips/tags)
- Slash commands for quick actions

**Why CodeMirror 6 over ProseMirror/TipTap:**
- Best vim mode implementation
- Better performance for large documents
- More control over rendering
- Yjs integration for collaborative/sync editing

### Layer 6: AI Features (Progressive)

**Phase 1 — Entity extraction + linking (core)**
- Auto-detect entities in notes
- Create/link to existing entity nodes
- Build knowledge graph automatically

**Phase 2 — Smart suggestions**
- "You mentioned 123 Main St — link to existing property?"
- "This looks like an expense — categorize as utility?"
- Related notes sidebar (vector similarity via sqlite-vec)

**Phase 3 — Query the graph**
- Natural language questions: "How much did I spend on the house this year?"
- LLM generates SQL/graph queries from natural language
- Timeline views, spending summaries, entity profiles

**Phase 4 — PDF/document processing**
- Extract text from PDFs (pdf.js or local OCR)
- Auto-extract entities from documents
- Suggest: "Attach this insurance PDF to the house entity?"

---

## Technology Choices & Tradeoffs

### Database: SQLite vs Alternatives

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **SQLite + junction tables** | Universal, embedded, FTS5, mature | Graph queries via recursive CTEs get awkward beyond 3-4 hops | **Winner** — personal scale doesn't need deep traversal |
| **Neo4j Community** | Best graph queries (Cypher), native traversal | JVM (500MB+ RAM), server-only, no mobile embed | Overkill for personal use |
| **SurrealDB** | Multi-model (doc + graph), Rust, WASM build | Still maturing, smaller ecosystem | Watch for future |
| **TypeDB** | Semantic reasoning, inference engine | Server-only, steep learning curve, heavy | Academic interest only |

### Desktop: Tauri vs Electron

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Tauri v2** | ~10MB binary, Rust backend, native webview, lower RAM | Smaller ecosystem, webview inconsistencies across OS | **Winner** — lighter, more performant |
| **Electron** | Huge ecosystem, consistent Chromium, proven | ~150MB binary, high RAM usage | Fallback if Tauri blocks us |

### Mobile: React Native vs PWA

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **React Native + Expo** | Native SQLite, share sheet, background sync, offline-first | Two codebases, app store review | **Winner** — offline-first is non-negotiable |
| **PWA** | Single codebase, no app store | iOS kills Service Workers after 30s background, no share sheet, limited storage | Not viable for primary mobile |

### Sync: CR-SQLite vs Alternatives

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **CR-SQLite** | CRDT merge on existing SQLite, per-column resolution | 2.5x insert overhead, still maturing | **Winner** — cleanest architecture |
| **CouchDB replication** | Proven (Obsidian LiveSync uses it), mature | Separate database, not SQLite-native | Good alternative |
| **Yjs** | Best for real-time text editing, character-level merge | Document-focused, not database-focused | Use for editor layer, not DB sync |
| **Syncthing** | Simple file sync | Conflicts with database files, not CRDT | Only for media/attachments |

### Entity Extraction: GLiNER + Triplex vs Alternatives

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **GLiNER (real-time) + Triplex (batch)** | Fast NER + purpose-built KG triples, both local | Two models to manage | **Winner** — speed where needed, depth where affordable |
| **spaCy** | Very fast, no GPU, mature | Entities only (no relationships), needs training for personal notes | Good fallback for offline/low-power |
| **General LLM (Mistral/Llama via Ollama)** | Flexible, handles any extraction prompt | Slower (2-5s per note), heavier | Use for complex/ambiguous cases |
| **Cloud API (GPT-4/Claude)** | Highest quality | Not self-hosted, costs money, privacy concerns | Against our principles |

---

## Development Roadmap (Proposed Phases)

### Phase 0: Foundation (Week 1-2)
- Project scaffolding (monorepo: Turborepo or Nx)
- SQLite schema + migrations
- Basic CRUD for notes and entities
- Unit test infrastructure

### Phase 1: Core Desktop App (Week 3-6)
- Tauri v2 desktop shell
- CodeMirror 6 editor with vim mode + markdown
- Daily log input (the primary interface)
- `[[wiki-link]]` syntax with autocomplete
- Basic entity/node viewer (click entity → see all connections)
- Local SQLite with FTS5 search
- Manual entity creation and linking

### Phase 2: AI Entity Extraction (Week 7-10)
- GLiNER integration for real-time NER
- Triplex/Ollama integration for relationship extraction
- Entity deduplication and merge UI
- Background processing pipeline
- "Suggested links" UI after writing a note

### Phase 3: Knowledge Graph UI (Week 11-14)
- Graph visualization (force-directed layout, like Obsidian's graph view)
- Entity profile pages (all connections, timeline, related notes)
- Backlink panel (what links here?)
- Timeline/calendar view for daily logs
- Spending/financial tracker view (auto-generated from expense entities)

### Phase 4: Sync + Mobile (Week 15-20)
- CR-SQLite integration
- Self-hosted sync server
- E2E encryption
- React Native + Expo mobile app
- Quick capture (share sheet, widget)
- Offline-first with background sync

### Phase 5: Web Clipper + Documents (Week 21-24)
- Manifest V3 browser extension
- Defuddle content extraction
- PDF ingestion + text extraction
- Auto-entity extraction from clipped/uploaded content
- Attachment management

### Phase 6: Advanced AI (Week 25+)
- Natural language graph queries
- Smart suggestions and auto-categorization
- Semantic search (sqlite-vec embeddings)
- Re-analysis on note edit (update/remove broken links)
- Template system for common entry types

---

## Open Questions

1. **Editor choice**: CodeMirror 6 vs building on top of an existing Markdown editor like Milkdown (which wraps ProseMirror but has plugin architecture)?

2. **Frontend framework**: React (largest ecosystem, React Native code sharing) vs Svelte (lighter, faster, Tauri-native feel) vs SolidJS?

3. **Monorepo structure**: How to share code between desktop (Tauri), mobile (React Native), and web clipper?

4. **Entity type system**: Pre-define entity types (person, place, amount, etc.) or let users define custom types? Or both?

5. **Graph visualization library**: D3.js (most flexible) vs Cytoscape.js (graph-focused) vs Sigma.js (large graph performance)?

6. **Ollama dependency**: Require users to install Ollama separately, or bundle a lightweight LLM runtime?

7. **Initial scope**: Should Phase 1 be even smaller — just a CLI tool that processes a markdown file and outputs entities?

---

## Competitive Advantages (Why Build This)

1. **Fully self-hosted** — Your data never leaves your devices (except to your own sync server)
2. **Local AI** — Entity extraction runs on your machine, no cloud API costs or privacy concerns
3. **Automatic linking** — The key differentiator vs Obsidian/Logseq (which require manual `[[links]]`)
4. **Vim-first** — Not an afterthought plugin, but core to the editor experience
5. **Universal access** — Desktop + mobile + web clipper, all synced
6. **Open data format** — SQLite is the most portable database format in existence
7. **Extensible** — Plugin system for custom entity types, extractors, views
