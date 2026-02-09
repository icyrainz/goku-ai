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
    @echo "  just daily              - Create today's daily note"
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
    @echo "Import & Enrich:"
    @echo "  just enrich <name>      - Enrich entity with metadata"
    @echo ""
    @echo "Development:"
    @echo "  just test               - Run tests"
    @echo "  just typecheck          - TypeScript type check"

# Create or view a daily note
daily date='':
    {{note}} daily {{date}}

# View today's overview
today:
    {{note}} daily --view

# View a specific date's overview
view date:
    {{note}} daily {{date}} --view

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

# Run tests
test:
    npm test

# TypeScript typecheck
typecheck:
    npx tsc --noEmit
