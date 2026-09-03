/**
 * Tiny client for the ForgeAI API. The dashboard talks to the backend only
 * over HTTP + SSE — it never imports the @forgeai/* packages or touches any
 * credentials (those live on the server).
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "") || "http://localhost:4000";

// Mirror of @forgeai/shared ForgeEvent (kept local so web has no workspace deps).
export interface ForgeEvent {
  id: number;
  type: string;
  message: string;
  ts: number;
  metadata?: Record<string, unknown>;
}

export interface TraceRow {
  criterion: { id: string; text: string };
  status: "passed" | "failed" | "unverified";
  checkIds: string[];
  openBugIds: string[];
  resolvedBugIds: string[];
  repaired: boolean;
  evidence: string[];
}

export interface EvidenceItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  source: string;
  timestamp: string;
  hash: string;
  relatedCheckId?: string;
  relatedCriteriaId?: string;
}

export interface ProjectDetail {
  id: string;
  name: string;
  requirement: string;
  status: "running" | "completed" | "failed" | "cancelled";
  verdict?: string;
  demo: boolean;
  createdAt: number;
  durationMs?: number;
  error?: string;
  report?: string;
  previewUrl?: string;
  unitTests?: { passed: number; failed: number };
  qa?: {
    passed: number;
    failed: number;
    blocked: number;
    inconclusive: number;
    bugs: { id: string; title: string; severity: string }[];
  };
  review?: { status: string; requirementsSatisfied: number };
  traceability?: TraceRow[];
  evidence?: EvidenceItem[];
  eventCount?: number;
}

export async function startBuild(input: {
  requirement: string;
  name?: string;
  demo?: boolean;
  scenario?: "happy" | "repair";
}): Promise<{ id: string; events: string }> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export async function getProject(id: string): Promise<ProjectDetail> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`);
  if (!res.ok) throw new Error(`Could not load project (${res.status})`);
  return res.json();
}

export async function cancelBuild(id: string): Promise<{ cancelling: boolean; status: string }> {
  const res = await fetch(`${API_BASE}/api/projects/${id}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(`Could not cancel (${res.status})`);
  return res.json();
}

export function eventStreamUrl(id: string): string {
  return `${API_BASE}/api/projects/${id}/events`;
}
