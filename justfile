# CLI shortcuts
# Usage: just <recipe>

vault := ".vault/vault-main"
note := "npx tsx src/cli/index.ts"

# Show available commands (default recipe)
default:
    @echo "My App - AI-powered personal knowledge graph"
    @echo ""
    @echo "Vault location: {{vault}}"
    @echo ""
    @echo "Daily Workflow:"
    @echo "  just daily              - Open today's daily note"
    @echo "  just daily 2026-02-07   - Open daily note for a specific date"
    @echo "  just quick              - Create a one-off quick note"
    @echo "  just today              - View today's overview"
    @echo "  just view 2026-01-07    - View specific date"
    @echo ""
    @echo "Core Commands:"
    @echo "  just init               - Initialize vault"
    @echo "  just scan               - Scan vault for new/changed files"
    @echo "  just process            - Process pending documents"
    @echo "  just process-interactive - Process with entity review"
    @echo "  just status             - Show vault and graph stats"
    @echo ""
    @echo "Browse & Search:"
    @echo "  just entity <name>      - Browse an entity"
    @echo "  just search <query>     - Search entities and documents"
    @echo "  just ask <question>     - Ask natural language question"
    @echo ""
    @echo "Maintenance:"
    @echo "  just rebuild            - Nuke graph index and reprocess everything"
    @echo ""
    @echo "Import & Enrich:"
    @echo "  just import-daily <dir> - Import daily notes from directory"
    @echo "  just enrich <name>      - Enrich entity with metadata"
    @echo ""
    @echo "Development:"
    @echo "  just test               - Run tests"
    @echo "  just typecheck          - TypeScript type check"

# Open today's daily note (one file per day)
daily date="":
    {{note}} daily {{date}}

# Create a one-off quick note
quick:
    {{note}} quick

# View today's overview
today:
    {{note}} today

# View a specific date's overview
view date:
    {{note}} today {{date}}

# Initialize the default persistent vault
init:
    @mkdir -p .vault
    {{note}} init {{vault}}
    @mkdir -p {{vault}}/daily
    @mkdir -p {{vault}}/quick
    @echo "✓ Vault initialized at {{vault}}"

# Scan vault for new/changed files
scan:
    {{note}} scan

# Process pending documents
process:
    {{note}} process

# Process with interactive entity review
process-interactive:
    {{note}} process --interactive

# Show vault and graph stats
status:
    {{note}} status

# Browse an entity
entity name:
    {{note}} entity "{{name}}"

# Search entities and documents
search query:
    {{note}} search "{{query}}"

# Ask a question
ask question:
    {{note}} ask "{{question}}"

# Nuke graph index and reprocess everything from scratch
rebuild:
    {{note}} rebuild

# Import daily notes from a directory
import-daily dir:
    {{note}} import daily-notes "{{dir}}"

# Run tests
test:
    npm test

# TypeScript typecheck
typecheck:
    npx tsc --noEmit
