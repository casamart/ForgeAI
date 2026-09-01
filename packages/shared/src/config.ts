/**
 * Central resource-limit + mode configuration (spec §28.3, §29, §42).
 * These are the guardrails that keep autonomous loops finite and metered
 * Solari resources bounded. Every value is env-overridable.
 */

export type InfraMode = "solari" | "local" | "auto";
export type AiProvider = "anthropic" | "openai" | "gemini" | "mock";

export interface ResourceLimits {
  maxBuildTimeMs: number;
  maxDebugLoops: number;
  maxRepairAttempts: number;
  maxBrowserSessions: number;
}

export interface ForgeConfig {
  infraMode: InfraMode;
  aiProvider: AiProvider;
  limits: ResourceLimits;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): ForgeConfig {
  const infraMode = (process.env.FORGEAI_MODE as InfraMode) || "auto";
  const aiProvider = (process.env.FORGEAI_AI_PROVIDER as AiProvider) || "mock";
  return {
    infraMode,
    aiProvider,
    limits: {
      maxBuildTimeMs: num("MAX_BUILD_TIME_MS", 600_000),
      maxDebugLoops: num("MAX_DEBUG_LOOPS", 3),
      maxRepairAttempts: num("MAX_REPAIR_ATTEMPTS", 3),
      maxBrowserSessions: num("MAX_BROWSER_SESSIONS", 1),
    },
  };
}

/** Resolve "auto" into a concrete infra mode based on available credentials. */
export function resolveInfraMode(mode: InfraMode): "solari" | "local" {
  if (mode === "solari") return "solari";
  if (mode === "local") return "local";
  return process.env.SOLARI_API_KEY ? "solari" : "local";
}
