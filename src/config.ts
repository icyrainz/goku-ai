import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';
import { homedir } from 'node:os';
import { join, extname, basename } from 'node:path';

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
 * Load configuration from TOML file with environment variable overrides.
 */
export function loadConfig(): Config {
  const defaultConfig: Config = {
    vault: {
      path: '~/notes',
    },
    llm: {
      baseUrl: 'http://localhost:11434/v1',
      model: 'mistral',
      apiKey: '',
      extractionModel: '',
      askModel: '',
    },
  };

  const configPath = join(homedir(), '.config', 'my-app', 'config.toml');
  let fileConfig: any = {};

  try {
    const fileContent = readFileSync(configPath, 'utf-8');
    fileConfig = parse(fileContent);
  } catch {
    // If file doesn't exist, use defaults
  }

  // Merge file config with defaults (file values are base)
  const merged = { ...defaultConfig, ...fileConfig };

  // Apply environment variable overrides
  const envVars = [
    { key: 'NOTE_VAULT_PATH', target: 'vault.path' },
    { key: 'NOTE_LLM_BASE_URL', target: 'llm.baseUrl' },
    { key: 'NOTE_LLM_MODEL', target: 'llm.model' },
    { key: 'NOTE_LLM_API_KEY', target: 'llm.apiKey' },
    { key: 'NOTE_LLM_EXTRACTION_MODEL', target: 'llm.extractionModel' },
    { key: 'NOTE_LLM_ASK_MODEL', target: 'llm.askModel' },
  ];

  for (const { key, target } of envVars) {
    const value = process.env[key];
    if (value) {
      // Navigate to the target property (e.g., 'vault.path')
      const pathParts = target.split('.');
      let current: any = merged;
      for (let i = 0; i < pathParts.length - 1; i++) {
        current = current[pathParts[i]];
      }
      current[pathParts[pathParts.length - 1]] = value;
    }
  }

  // Apply defaults for any missing values
  // vault.path
  if (!merged.vault.path) merged.vault.path = defaultConfig.vault.path;
  // llm.base_url -> llm.baseUrl (already set)
  // llm.model -> already set
  // llm.api_key -> already set
  // llm.extraction.model
  if (!merged.llm.extractionModel) merged.llm.extractionModel = merged.llm.model;
  // llm.ask.model
  if (!merged.llm.askModel) merged.llm.askModel = merged.llm.model;

  // Tilde expansion for vault.path
  merged.vault.path = merged.vault.path.replace(/^~/, homedir());

  return merged;
}