import fs from "node:fs";
import path from "node:path";
import type { AIProviderType } from "@/types/database";

const DATA_DIR = path.join(process.cwd(), ".data");
const RUNTIME_CONFIG_FILE = path.join(DATA_DIR, "server-config.json");

export interface RuntimeServerOverrides {
  aiProvider?: AIProviderType;
  aiModel?: string;
  aiEmbeddingModel?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  anthropicApiKey?: string;
  aiBaseUrl?: string;
  aiCompatibleApiKey?: string;
}

function readRuntimeOverrides(): RuntimeServerOverrides {
  try {
    if (!fs.existsSync(RUNTIME_CONFIG_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(RUNTIME_CONFIG_FILE, "utf8");
    return JSON.parse(raw) as RuntimeServerOverrides;
  } catch {
    return {};
  }
}

export function saveRuntimeOverrides(patch: RuntimeServerOverrides): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const existing = readRuntimeOverrides();
  const next: RuntimeServerOverrides = { ...existing };

  for (const [key, value] of Object.entries(patch) as [
    keyof RuntimeServerOverrides,
    string | undefined,
  ][]) {
    if (value !== undefined) {
      const trimmed = value.trim();
      if (trimmed === "__CLEAR__") {
        delete next[key];
      } else if (trimmed.length > 0) {
        (next as Record<string, string>)[key] = trimmed;
      }
    }
  }

  fs.writeFileSync(RUNTIME_CONFIG_FILE, JSON.stringify(next, null, 2), {
    mode: 0o600,
  });
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  return Boolean(
    url &&
      anonKey &&
      url.startsWith("http") &&
      !url.includes("your-project")
  );
}

export interface ActiveAIConfig {
  provider: AIProviderType;
  model: string;
  embeddingModel: string;
  apiKey: string;
  baseUrl?: string;
  isConfigured: boolean;
  availableProviders: {
    openai: boolean;
    gemini: boolean;
    anthropic: boolean;
    compatible: boolean;
  };
}

const DEFAULT_MODELS: Record<AIProviderType, string> = {
  openai: "gpt-4o-mini",
  gemini: "gemini-2.5-flash",
  anthropic: "claude-3-5-sonnet-latest",
  compatible: "llama3.1",
};

const DEFAULT_EMBEDDING_MODELS: Record<AIProviderType, string> = {
  openai: "text-embedding-3-small",
  gemini: "text-embedding-004",
  anthropic: "text-embedding-3-small",
  compatible: "nomic-embed-text",
};

export function getActiveAIConfig(
  preferredProvider?: AIProviderType,
  preferredModel?: string
): ActiveAIConfig {
  const overrides = readRuntimeOverrides();

  const openaiKey = overrides.openaiApiKey || process.env.OPENAI_API_KEY || "";
  const geminiKey = overrides.geminiApiKey || process.env.GEMINI_API_KEY || "";
  const anthropicKey =
    overrides.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  const baseUrl = overrides.aiBaseUrl || process.env.AI_BASE_URL || "";
  const compatibleKey =
    overrides.aiCompatibleApiKey ||
    process.env.AI_COMPATIBLE_API_KEY ||
    (baseUrl ? "local-compatible" : "");

  const availableProviders = {
    openai: Boolean(openaiKey.trim()),
    gemini: Boolean(geminiKey.trim()),
    anthropic: Boolean(anthropicKey.trim()),
    compatible: Boolean(baseUrl.trim()),
  };

  let provider: AIProviderType =
    preferredProvider ||
    overrides.aiProvider ||
    (process.env.AI_PROVIDER as AIProviderType) ||
    "openai";

  // Auto-select an available provider if the default one has no key but another does
  if (!availableProviders[provider]) {
    if (availableProviders.openai) provider = "openai";
    else if (availableProviders.gemini) provider = "gemini";
    else if (availableProviders.anthropic) provider = "anthropic";
    else if (availableProviders.compatible) provider = "compatible";
  }

  const apiKeyMap: Record<AIProviderType, string> = {
    openai: openaiKey,
    gemini: geminiKey,
    anthropic: anthropicKey,
    compatible: compatibleKey,
  };

  const model =
    preferredModel?.trim() ||
    overrides.aiModel?.trim() ||
    process.env.AI_MODEL?.trim() ||
    DEFAULT_MODELS[provider];

  const embeddingModel =
    overrides.aiEmbeddingModel?.trim() ||
    process.env.AI_EMBEDDING_MODEL?.trim() ||
    DEFAULT_EMBEDDING_MODELS[provider];

  const apiKey = apiKeyMap[provider]?.trim() || "";
  const isConfigured =
    provider === "compatible" ? Boolean(baseUrl.trim()) : Boolean(apiKey);

  return {
    provider,
    model,
    embeddingModel,
    apiKey,
    baseUrl: baseUrl.trim() || undefined,
    isConfigured,
    availableProviders,
  };
}

export function getPublicSystemStatus() {
  const ai = getActiveAIConfig();
  return {
    storageMode: isSupabaseConfigured() ? "supabase" : "local_persistent",
    supabaseConfigured: isSupabaseConfigured(),
    aiConfigured: ai.isConfigured,
    activeProvider: ai.provider,
    activeModel: ai.model,
    embeddingModel: ai.embeddingModel,
    availableProviders: ai.availableProviders,
    maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 25),
    ocrEnabled: process.env.ENABLE_OCR !== "false",
  };
}

