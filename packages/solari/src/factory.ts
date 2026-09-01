/**
 * Infrastructure factory — the ONE place that decides real Solari vs local mock.
 * Everything else in ForgeAI depends only on the ISolariProvider interface.
 */
import { resolveInfraMode, type InfraMode } from "@forgeai/shared";
import type { ISolariProvider } from "./types.js";
import { SolariProvider } from "./solari-provider.js";
import { LocalProvider } from "./local-provider.js";

export interface CreateProviderResult {
  provider: ISolariProvider;
  mode: "solari" | "local";
}

/**
 * Build the infrastructure provider for the given mode ("auto" by default).
 * "auto" -> Solari when SOLARI_API_KEY is present, otherwise the local mock.
 */
export function createSolariProvider(
  mode: InfraMode = "auto",
): CreateProviderResult {
  const resolved = resolveInfraMode(mode);
  return resolved === "solari"
    ? { provider: new SolariProvider(), mode: "solari" }
    : { provider: new LocalProvider(), mode: "local" };
}
