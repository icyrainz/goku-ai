import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'smol-toml';
import { homedir } from 'node:os';
import { join } from 'node:path';

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

/**
 * Resolve model for a given purpose, falling back to the default model.
 */
export function resolveModel(config: Config, purpose: 'extraction' | 'ask'): string {
  if (purpose === 'extraction' && config.llm.extractionModel) return config.llm.extractionModel;
  if (purpose === 'ask' && config.llm.askModel) return config.llm.askModel;
  return config.llm.model;
}

/**
 * Load and parse a TOML config file, returning raw parsed object.
 * Returns empty object if file doesn't exist or fails to parse.
 */
function loadTomlFile(filePath: string): Record<string, any> {
  try {
    if (!existsSync(filePath)) return {};
    const content = readFileSync(filePath, 'utf-8');
    return parse(content) as Record<string, any>;
  } catch {
    return {};
  }
}

/**
 * Convert raw TOML config (snake_case, nested sections) into our Config interface.
 */
function tomlToConfig(raw: Record<string, any>): Partial<Config> {
  const result: any = {};

  if (raw.vault) {
    result.vault = { path: raw.vault.path || '' };
  }

  if (raw.llm) {
    result.llm = {
      baseUrl: raw.llm.base_url || raw.llm.baseUrl || '',
      model: raw.llm.model || '',
      apiKey: raw.llm.api_key ?? raw.llm.apiKey ?? '',
      extractionModel: raw.llm.extraction?.model || '',
      askModel: raw.llm.ask?.model || '',
    };
  }

  return result;
}

/**
 * Load configuration with priority:
 *   1. Environment variables (highest)
 *   2. Local app.config.toml (in CWD)
 *   3. Global ~/.config/my-app/config.toml
 *   4. Defaults (lowest)
 */
export function loadConfig(): Config {
  const defaults: Config = {
    vault: { path: '~/notes' },
    llm: {
      baseUrl: 'http://localhost:11434/v1',
      model: 'mistral',
      apiKey: '',
      extractionModel: '',
      askModel: '',
    },
  };

  // Load global config
  const globalPath = join(homedir(), '.config', 'my-app', 'config.toml');
  const globalConfig = tomlToConfig(loadTomlFile(globalPath));

  // Load local config (CWD) — takes precedence over global
  const localPath = join(process.cwd(), 'app.config.toml');
  const localConfig = tomlToConfig(loadTomlFile(localPath));

  // Merge: defaults ← global ← local
  const merged: Config = {
    vault: {
      path: localConfig.vault?.path || globalConfig.vault?.path || defaults.vault.path,
    },
    llm: {
      baseUrl: localConfig.llm?.baseUrl || globalConfig.llm?.baseUrl || defaults.llm.baseUrl,
      model: localConfig.llm?.model || globalConfig.llm?.model || defaults.llm.model,
      apiKey: localConfig.llm?.apiKey ?? globalConfig.llm?.apiKey ?? defaults.llm.apiKey,
      extractionModel: localConfig.llm?.extractionModel || globalConfig.llm?.extractionModel || '',
      askModel: localConfig.llm?.askModel || globalConfig.llm?.askModel || '',
    },
  };

  // Environment variable overrides (highest priority)
  if (process.env.NOTE_VAULT_PATH) merged.vault.path = process.env.NOTE_VAULT_PATH;
  if (process.env.NOTE_LLM_BASE_URL) merged.llm.baseUrl = process.env.NOTE_LLM_BASE_URL;
  if (process.env.NOTE_LLM_MODEL) merged.llm.model = process.env.NOTE_LLM_MODEL;
  if (process.env.NOTE_LLM_API_KEY) merged.llm.apiKey = process.env.NOTE_LLM_API_KEY;
  if (process.env.NOTE_LLM_EXTRACTION_MODEL) merged.llm.extractionModel = process.env.NOTE_LLM_EXTRACTION_MODEL;
  if (process.env.NOTE_LLM_ASK_MODEL) merged.llm.askModel = process.env.NOTE_LLM_ASK_MODEL;

  // Fall back extraction/ask models to main model if still empty
  if (!merged.llm.extractionModel) merged.llm.extractionModel = merged.llm.model;
  if (!merged.llm.askModel) merged.llm.askModel = merged.llm.model;

  // Tilde expansion for vault.path
  if (merged.vault.path.startsWith('~')) {
    merged.vault.path = merged.vault.path.replace(/^~/, homedir());
  }

  // Resolve relative vault path against CWD
  if (!merged.vault.path.startsWith('/')) {
    merged.vault.path = join(process.cwd(), merged.vault.path);
  }

  return merged;
}