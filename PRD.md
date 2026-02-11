# Product Requirements Document (PRD)

## Overview

A CLI-first personal knowledge graph that works like a smart file system. You have a vault directory full of files — markdown notes, CSVs, JSON exports, images, whatever. The system scans them, uses a local LLM to extract entities and relationships, and builds a navigable knowledge graph on top.

**Core Principle**: Files are the only source of truth. The SQLite database is a pure derived index — metadata, entities, and relationships only. No content is stored in the database.

**Prototype Scope**: CLI tool with `$EDITOR` input, vault scanning, LLM-powered entity extraction, SQLite graph index, and numbered-reference entity browsing.

---

## Problem Statement

Existing note-taking tools (Obsidian, Logseq, Notion) require manual `[[wiki-links]]` to connect information. This creates two failure modes:

1. **You forget to link** — information exists but is disconnected and unfindable
2. **Linking is friction** — you stop capturing because formatting/linking is overhead

The insight: an LLM can extract entities and relationships from natural language, building the knowledge graph automatically. You just write.

---

## User Stories

### P0 — Must Have

1. **As a user, I have a vault directory** that holds my files. I can symlink my Obsidian vault, dump Google Keep exports, or just drop files in.

2. **As a user, I can scan my vault** by running `note scan`, which discovers files, detects types, and queues new/changed files.

3. **As a user, I can capture quick notes** by running `note quick` (opens `$EDITOR`) or `note daily` (today's date file). All notes are files in the vault.

4. **As a user, I can batch-process files** by running `note process`, which extracts entities and relationships via LLM.

5. **As a user, I can browse entities** by running `note entity <name>`, showing related entities and source documents.

6. **As a user, I can search** by running `note search <query>` for fuzzy matching across entities and documents.

7. **As a user, I can ask questions** by running `note ask "how much did I spend on Main St?"` using the knowledge graph.

8. **As a user, I can configure the LLM** via config file with `base_url`, `model`, and `api_key`. Default: local Ollama.

9. **As a user, I can import external formats** by running `note import google-keep <path>` to convert to vault files.

10. **As a user, I can retroactively improve the graph** by running `note process --relink` to reconnect old documents with new entity knowledge.

### P1 — Important

11. **As a user, I can view today's notes** with `note today` and see extracted entities.

12. **As a user, I can view a timeline** with `note log` showing recent notes chronologically.

13. **As a user, I can manually link entities** with `note link <a> <b> --type <relationship>`.

14. **As a user, I can merge duplicates** with `note merge <entity-a> <entity-b>`.

15. **As a user, the system handles non-text files** — images via multimodal LLM, CSVs as structured data, PDFs via text extraction.

16. **As a user, I can use multi-pass processing** for better accuracy on long documents and ambiguous references.

17. **As a user, I can run smart relinking** with `note process --relink --smart` to only reprocess affected documents.

18. **As a user, I can review suggested merges** with `note merge --review`.

19. **As a user, I can debug extractions** with `note debug <document> --entity <name>`.

20. **As a user, I can view insights** with `note insights` to see graph improvements over time.

### P2 — Nice to Have

21. **As a user, I can pipe input** via `echo "..." | note quick`.

22. **As a user, I can add inline notes** via `note quick "quick thought"`.

23. **As a user, I can view entity statistics** — most connected, recent, orphaned.

24. **As a user, I can watch the vault** for auto-scanning file changes.

25. **As a user, I can split conflated entities** with `note split <entity>`.

26. **As a user, I can retype entities** with `note retype <entity> <type>`.

---

## Architecture

### High-Level Flow

```
Vault Files (~/notes)
       ↓
note scan (detect changes)
       ↓
Content Extractors (.md, .csv, .json, .txt)
       ↓
LLM Processing (entity + relationship extraction)
       ↓
SQLite Graph Index (entities, relationships, document links)
```

**Key Principle**: Files are the source of truth. The database is derived and rebuildable.

### Core Components

- **Documents**: File metadata registry (path, hash, processing state)
- **Entities**: People, places, amounts, etc. extracted from text
- **Relationships**: Connections between entities (payment_for, lives_at, etc.)
- **Document-Entity Links**: Which documents mention which entities

---

## CLI Interface

### Commands

```
note init [path]                  Initialize vault (default: ~/notes)
note daily [date]                 Open today's note in $EDITOR
note quick ["text"]               Quick note (opens editor or saves inline)
note scan                         Scan vault for new/changed files
note process                      Process pending documents
note process --relink             Reprocess all documents
note process --relink --smart     Smart relink (targeted reprocessing)
note entity <name>                Browse entity connections
note search <query>               Fuzzy search entities and documents
note ask "<question>"             Ask question using knowledge graph
note import google-keep <path>    Import Google Keep export
note status                       Show vault/graph stats
note rebuild                      Nuke index and rebuild from scratch
note link <a> <b> [--type T]      Create manual relationship (P1)
note merge <a> [b]                Merge entities or review suggestions (P1)
note split <entity>               Split conflated entity (P1)
note retype <entity> <type>       Reclassify entity type (P1)
note debug <document>             Debug extraction (P1)
note insights                     View graph insights (P1)
note today                        View today's notes (P1)
note log [--days N]               View timeline (P1)
note config                       Show configuration (P2)
```

---

## Success Criteria

The prototype is successful when:

1. **Core Functionality**: I can scan an Obsidian vault, import Google Keep, and extract entities from hundreds of files via local LLM.

2. **Entity Browsing**: `note entity "123 Main St"` shows all related entities and source files with numbered navigation.

3. **Search & Ask**: `note search "John"` and `note ask "how much did I spend?"` work with referenced entities.

4. **Deduplication**: "123 Main St" and "the house on Main St" merge reasonably.

5. **Retroactive Improvement**: `note process --relink` connects old documents to newly-discovered entities.

6. **Files-First**: Everything is files — I can delete the DB and rebuild from vault.

7. **Configurable LLM**: Works with Ollama, llama.cpp, or any OpenAI-compatible API.

8. **Multi-Pass Accuracy**: Resolves ambiguous references (e.g., "John" → correct person based on context).

9. **Long Documents**: Handles documents >4k tokens accurately via chunking.

10. **Transparency**: `note process --verbose` shows extraction steps and reasoning.

11. **Smart Relink**: `--smart` flag processes <20% of docs for 90%+ accuracy improvement.

12. **Refinement**: After 6 months, relinking resolves 80%+ of initially ambiguous references.

13. **Debugging**: `note debug` explains why entities were extracted.

14. **Implicit Discovery**: Discovers meaningful implicit relationships via co-mention analysis.

---

## Non-Goals (Prototype)

- No GUI / desktop app / web UI
- No sync / multi-device
- No mobile
- No plugin system
- No real-time extraction (manual `note process` only)
- No user accounts or multi-user
- No vector/semantic search (FTS5 only)
- No image/PDF processing initially (text files: .md, .txt, .csv, .json)
- No web clipper
- No file watching (manual `note scan`)

---

## Open Questions

1. **Prompt Engineering**: How much tuning needed for reliable extraction across different LLMs?

2. **Entity Merging**: Auto-merge with log, or interactive confirmation?

3. **Relink Frequency**: Auto-suggest after N new notes, or manual only?

4. **Multi-Pass vs. Single-Pass**: Always multi-pass, or auto-detect based on doc length?

5. **Smart Relink Heuristics**: Which criteria best identify docs needing reprocessing?

---

## See Also

- **TDD.md**: Technical Design Document (data models, algorithms, implementation details)
