import { getActiveAIConfig } from "@/lib/config/server-config";
import { normalizeTurkish } from "@/lib/utils";
import type { AIProviderType } from "@/types/database";

export class AIConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigurationError";
  }
}

export interface LLMCompletionParams {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  preferredProvider?: AIProviderType;
  preferredModel?: string;
}

export function computeLocalEmbedding(text: string, dims = 256): number[] {
  const vec = new Array<number>(dims).fill(0);
  const norm = normalizeTurkish(text);
  const tokens = norm.split(/[^a-z0-9ğüşıöç]+/i).filter((t) => t.length >= 2);

  for (const token of tokens) {
    const grams = [token];
    for (let i = 0; i <= token.length - 3; i++) {
      grams.push(token.slice(i, i + 3));
    }
    for (const g of grams) {
      let h = 2166136261;
      for (let c = 0; c < g.length; c++) {
        h ^= g.charCodeAt(c);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % dims;
      const sign = h & 1 ? 1 : -1;
      vec[idx] += sign * (g === token ? 2.0 : 0.75);
    }
  }

  let mag = 0;
  for (let i = 0; i < dims; i++) mag += vec[i] * vec[i];
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < dims; i++) vec[i] = Number((vec[i] / mag).toFixed(5));
  return vec;
}

export async function generateEmbeddings(
  texts: string[],
  preferredProvider?: AIProviderType
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const cfg = getActiveAIConfig(preferredProvider);

  if (
    cfg.availableProviders.openai &&
    (cfg.provider === "openai" || cfg.provider === "anthropic")
  ) {
    const openaiKey =
      cfg.provider === "openai"
        ? cfg.apiKey
        : process.env.OPENAI_API_KEY || "";
    if (openaiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model: cfg.embeddingModel || "text-embedding-3-small",
            input: texts.map((t) => t.slice(0, 7500)),
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            data: { embedding: number[] }[];
          };
          if (Array.isArray(json.data) && json.data.length === texts.length) {
            return json.data.map((d) => d.embedding);
          }
        }
      } catch {
        // Fall back to local embedding
      }
    }
  }

  return texts.map((t) => computeLocalEmbedding(t, 256));
}

export async function completeWithLLM(
  params: LLMCompletionParams
): Promise<string> {
  const cfg = getActiveAIConfig(
    params.preferredProvider,
    params.preferredModel
  );

  if (!cfg.isConfigured) {
    throw new AIConfigurationError(
      "Yapay zeka sağlayıcı API anahtarı henüz yapılandırılmamış. Lütfen Ayarlar > Yapay Zeka Yapılandırması bölümünden API anahtarınızı tanımlayın."
    );
  }

  const temperature = params.temperature ?? 0.3;
  const maxTokens = params.maxTokens ?? 8192;

  if (cfg.provider === "openai" || cfg.provider === "compatible") {
    const endpoint =
      cfg.provider === "compatible" && cfg.baseUrl
        ? `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`
        : "https://api.openai.com/v1/chat/completions";

    const body: Record<string, unknown> = {
      model: cfg.model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: params.systemPrompt },
        { role: "user", content: params.userPrompt },
      ],
    };

    if (params.jsonMode && cfg.provider === "openai") {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `YZ Sağlayıcı Hatası (${res.status}): ${errText.slice(0, 240)}`
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  if (cfg.provider === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      cfg.model
    )}:generateContent`;

    const generationConfig: Record<string, unknown> = {
      temperature: Math.max(temperature, 0.4),
      maxOutputTokens: Math.min(Math.max(maxTokens, 4096), 8192),
      ...(params.jsonMode ? { responseMimeType: "application/json" } : {}),
    };

    // Cap thinking budget on Gemini 2.5 Flash so responses are fast and never starve output tokens
    if (cfg.model.includes("2.5-flash")) {
      generationConfig.thinkingConfig = { thinkingBudget: 256 };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cfg.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `${params.systemPrompt}\nKESİN BİÇİM KURALI: Markdown tablosu yazarken hizalama işareti (:---) ASLA kullanma; ayırıcı satırı yalnızca düz ve kısa "| --- | --- |" şeklinde yaz.`,
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: params.userPrompt }],
          },
        ],
        generationConfig,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Google Gemini API Hatası (${res.status}): ${errText.slice(0, 240)}`
      );
    }

    const data = (await res.json()) as {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean }[] };
      }[];
    };
    const rawOut =
      data.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        .map((p) => p.text || "")
        .join("")
        .trim() || "";

    // Guard against Gemini GFM table dash repetition loops
    return rawOut.replace(/-{8,}/g, "---").replace(/={8,}/g, "===");
  }

  if (cfg.provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: maxTokens,
        temperature,
        system: params.systemPrompt,
        messages: [{ role: "user", content: params.userPrompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Anthropic API Hatası (${res.status}): ${errText.slice(0, 240)}`
      );
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    return (
      data.content
        ?.filter((c) => c.type === "text")
        .map((c) => c.text || "")
        .join("")
        .trim() || ""
    );
  }

  throw new AIConfigurationError("Desteklenmeyen yapay zeka sağlayıcısı.");
}

/**
 * Repairs common LLM JSON quirks (markdown code fences, LaTeX backslashes like \frac or \alpha,
 * raw newlines inside string values, and trailing commas before } or ]).
 */
function sanitizeJsonString(input: string): string {
  let out = "";
  let inString = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (!inString) {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
      i++;
      continue;
    }

    // Inside a JSON string literal
    if (ch === '"') {
      inString = false;
      out += ch;
      i++;
      continue;
    }

    if (ch === "\\") {
      const next = input[i + 1];
      if (next && '"\\/bfnrt'.includes(next)) {
        out += ch + next;
        i += 2;
        continue;
      }
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(input.slice(i + 2, i + 6))) {
        out += input.slice(i, i + 6);
        i += 6;
        continue;
      }
      // Invalid escape (e.g. LaTeX \alpha, \sum, \_): escape the backslash itself
      out += "\\\\";
      i++;
      continue;
    }

    if (ch === "\n") {
      out += "\\n";
      i++;
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      i++;
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  // Remove trailing commas outside strings: , } -> } and , ] -> ]
  return out.replace(/,\s*([}\]])/g, "$1");
}

export function parseJsonFromLLM<T>(raw: string): T {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // 1. Direct parse
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // Continue to extraction & repair
  }

  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  const candidate =
    firstBrace !== -1 && lastBrace > firstBrace
      ? stripped.slice(firstBrace, lastBrace + 1)
      : stripped;

  // 2. Sanitized parse (fixes LaTeX backslashes, unescaped newlines, trailing commas)
  try {
    return JSON.parse(sanitizeJsonString(candidate)) as T;
  } catch {
    // 3. Truncated JSON array recovery (e.g., {"questions": [ {...}, {... )
    const repaired = sanitizeJsonString(candidate);
    const lastCompleteObj = repaired.lastIndexOf("}");
    if (lastCompleteObj > 0) {
      for (const suffix of ["]}", "}", '"}']) {
        try {
          return JSON.parse(
            repaired.slice(0, lastCompleteObj + 1) + suffix
          ) as T;
        } catch {
          // Try next suffix
        }
      }
    }

    throw new Error(
      "Yapay zeka yanıtı geçerli bir yapılandırılmış veri (JSON) olarak ayrıştırılamadı. Lütfen tekrar deneyiniz."
    );
  }
}
