// Project Status Sync — fetches all active businesses and writes STATUS.md for each.
// Runs every 15 minutes via launchd.

import fs from "fs/promises";
import path from "path";
import { buildProjectStatusMarkdown } from "@l5/core";
import { getFeaturePlans } from "../api/acr-client.js";

const L5_BASE_URL = process.env.L5_BASE_URL ?? "http://localhost:13000";
const L5_ADMIN_TOKEN = process.env.L5_ADMIN_TOKEN ?? "";
const REPO_ROOT = path.resolve(__dirname, "../../../../");

function l5Headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(L5_ADMIN_TOKEN ? { Authorization: `Bearer ${L5_ADMIN_TOKEN}` } : {}),
  };
}

async function l5Fetch(url: string): Promise<any> {
  const res = await fetch(url, { headers: l5Headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`L5 API ${res.status} ${url}: ${text}`);
  }
  return res.json();
}

export interface ActiveBusiness {
  id: string;
  name: string;
  one_liner?: string;
  current_phase?: string;
  lifecycle_stage?: string;
}

export interface ProjectData {
  agentTasks: any[];
  handoffs: any[];
  ctoPlan: any;
  openItems: any[];
  insights: any[];
}

export interface SyncResult {
  updated: number;
  failed: number;
  details: Array<{ businessId: string; ok: boolean; error?: string }>;
}

export interface ProjectStatusSyncDeps {
  listActiveBusinesses: () => Promise<ActiveBusiness[]>;
  fetchProjectData: (businessId: string) => Promise<ProjectData>;
  writeStatusFile: (businessId: string, markdown: string) => Promise<void>;
  logger?: (...args: any[]) => void;
}

async function defaultListActiveBusinesses(): Promise<ActiveBusiness[]> {
  const url = `${L5_BASE_URL}/api/businesses:list?filter[status]=active`;
  const data = await l5Fetch(url);
  const rows: any[] = data?.data ?? data ?? [];
  return rows.map((r: any) => ({
    id: r.id ?? r._id,
    name: r.name ?? r.title ?? r.id,
    one_liner: r.one_liner,
    current_phase: r.current_phase,
    lifecycle_stage: r.lifecycle_stage,
  }));
}

async function defaultFetchProjectData(businessId: string): Promise<ProjectData> {
  const tasksUrl = `${L5_BASE_URL}/api/agent_tasks:list?filter[business_id]=${encodeURIComponent(businessId)}&sort=-updated_at&pageSize=50`;
  const handoffsUrl = `${L5_BASE_URL}/api/agent_handoffs:list?filter[business_id]=${encodeURIComponent(businessId)}&sort=-at&pageSize=50`;

  const [tasksData, handoffsData, ctoPlan] = await Promise.all([
    l5Fetch(tasksUrl).catch(() => ({ data: [] })),
    l5Fetch(handoffsUrl).catch(() => ({ data: [] })),
    getFeaturePlans(businessId),
  ]);

  const agentTasks: any[] = tasksData?.data ?? tasksData ?? [];
  const handoffs: any[] = handoffsData?.data ?? handoffsData ?? [];

  // Derive openItems from tasks flagged as needs_review or blocked
  const openItems = agentTasks
    .filter((t: any) => t.status === "blocked" || t.status === "needs_review")
    .map((t: any) => ({
      kind: t.status === "blocked" ? "blocked" : "pending_approval",
      task_id: t.id,
      note: t.blocker ?? undefined,
    }));

  return { agentTasks, handoffs, ctoPlan, openItems, insights: [] };
}

async function defaultWriteStatusFile(businessId: string, markdown: string): Promise<void> {
  const dir = path.join(REPO_ROOT, "docs", "projects", businessId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "STATUS.md"), markdown, "utf-8");
}

export async function runProjectStatusSync(
  deps?: Partial<ProjectStatusSyncDeps>,
): Promise<SyncResult> {
  const listActiveBusinesses = deps?.listActiveBusinesses ?? defaultListActiveBusinesses;
  const fetchProjectData = deps?.fetchProjectData ?? defaultFetchProjectData;
  const writeStatusFile = deps?.writeStatusFile ?? defaultWriteStatusFile;
  const log = deps?.logger ?? console.log;

  const details: SyncResult["details"] = [];

  let businesses: ActiveBusiness[];
  try {
    businesses = await listActiveBusinesses();
  } catch (err) {
    const msg = (err as Error).message;
    log("[ProjectStatusSync] Failed to list businesses:", msg);
    return { updated: 0, failed: 0, details: [] };
  }

  log(`[ProjectStatusSync] Processing ${businesses.length} active businesses`);

  for (const biz of businesses) {
    try {
      const projectData = await fetchProjectData(biz.id);
      const markdown = buildProjectStatusMarkdown({
        business: biz,
        agentTasks: projectData.agentTasks,
        handoffs: projectData.handoffs,
        ctoPlan: projectData.ctoPlan ?? undefined,
        openItems: projectData.openItems,
        insights: projectData.insights,
        generatedAt: new Date().toISOString(),
      });
      await writeStatusFile(biz.id, markdown);
      log(`[ProjectStatusSync] Updated STATUS.md for business ${biz.id} (${biz.name})`);
      details.push({ businessId: biz.id, ok: true });
    } catch (err) {
      const msg = (err as Error).message;
      log(`[ProjectStatusSync] Failed for business ${biz.id}:`, msg);
      details.push({ businessId: biz.id, ok: false, error: msg });
    }
  }

  const updated = details.filter((d) => d.ok).length;
  const failed = details.filter((d) => !d.ok).length;
  return { updated, failed, details };
}
