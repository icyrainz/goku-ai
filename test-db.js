import { loadConfig } from '../src/config.js';
import { getDb } from '../src/core/db.js';

const config = loadConfig();
const db = getDb(config);
const tables = db.prepare('SELECT name FROM sqlite_master WHERE type="table"').all();
console.log('Tables:', tables);
db.close();