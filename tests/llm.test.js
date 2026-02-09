import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { getDb } from '../src/core/db.js';
import { getPendingDocuments } from '../src/core/documents.js';
import { extractEntities } from '../src/llm/extract.js';
describe('LLM Extraction', () => {
    it('should extract entities from text', async () => {
        const config = loadConfig();
        const db = getDb(config);
        const pending = getPendingDocuments(db);
        if (pending.length === 0) {
            console.log('No pending documents to test');
            return;
        }
        const doc = pending[0];
        const text = doc.extracted_text || '';
        console.log('Processing document:', doc.file_path || doc.title);
        console.log('Text:', text.slice(0, 200));
        const entities = await extractEntities(config, text);
        console.log('Extracted entities:', entities);
        expect(Array.isArray(entities)).toBe(true);
    });
    it('should extract entities from text', async () => {
        const config = loadConfig();
        const db = getDb(config);
        const pending = getPendingDocuments(db);
        if (pending.length === 0) {
            console.log('No pending documents to test');
            return;
        }
        const doc = pending[0];
        const text = doc.extracted_text || '';
        console.log('Processing document:', doc.file_path || doc.title);
        console.log('Text:', text.slice(0, 200));
        const entities = await extractEntities(config, text);
        console.log('Extracted entities:', entities);
        expect(Array.isArray(entities)).toBe(true);
    }, 60000);
});
//# sourceMappingURL=llm.test.js.map