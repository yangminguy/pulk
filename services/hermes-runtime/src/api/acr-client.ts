// ACR (Agent Control Room) HTTP client.
// Notifies ACR when D3+ approval tasks are created, and registers new projects.
// ACR_BASE_URL defaults to localhost:3001 for local dev.

const ACR_BASE_URL = process.env.ACR_BASE_URL ?? "http://localhost:3001";
const ACR_API_KEY = process.env.ACR_API_KEY ?? "";

async function acrFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${ACR_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(ACR_API_KEY ? { "X-API-Key": ACR_API_KEY } : {}),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ACR API ${res.status}: ${text}`);
  }
  return res.json();
}

export interface ACRApprovalRequest {
  task_id: string;
  title: string;
  rationale: string;
  risk_level: string;
  assigned_agent: string;
  acr_token: string;
  callback_url: string;
}

export async function notifyACRApprovalRequired(
  req: ACRApprovalRequest,
): Promise<{ accepted: boolean }> {
  try {
    const data = await acrFetch("/api/approvals", {
      method: "POST",
      body: JSON.stringify(req),
    });
    return { accepted: data.accepted ?? true };
  } catch (err) {
    // ACR가 없어도 L5는 계속 동작. 토큰은 이미 저장됨.
    console.warn("[ACR] approvalRequired notification failed:", err);
    return { accepted: false };
  }
}

export interface ACRProjectRegistration {
  project_id: string;
  title: string;
  one_liner: string;
  l5_business_id: string;
  /** Optional absolute path to the project on the host filesystem. */
  project_path?: string;
}

export async function registerACRProject(
  reg: ACRProjectRegistration,
): Promise<{ acr_project_id: string | null }> {
  try {
    const data = await acrFetch("/api/projects", {
      method: "POST",
      body: JSON.stringify(reg),
    });
    return { acr_project_id: data.id ?? null };
  } catch (err) {
    console.warn("[ACR] project registration failed:", err);
    return { acr_project_id: null };
  }
}

export interface ACRProject {
  id: string;
  title?: string;
  one_liner?: string;
  l5_business_id?: string;
}

export interface ACRFeaturePlan {
  plan_id?: string;
  phases?: Array<{
    name: string;
    runtime?: string;
    status: "todo" | "running" | "done" | "failed" | "planned" | "in_progress";
    updated_at?: string;
  }>;
}

/** GET /api/projects/<projectId> */
export async function getProject(projectId: string): Promise<ACRProject | null> {
  try {
    return await acrFetch(`/api/projects/${projectId}`);
  } catch (err) {
    console.warn(`[ACR] getProject(${projectId}) failed:`, err);
    return null;
  }
}

/** GET /api/feature-plans?projectId=<projectId> — returns first plan or null */
export async function getFeaturePlans(projectId: string): Promise<ACRFeaturePlan | null> {
  try {
    const data = await acrFetch(`/api/feature-plans?projectId=${encodeURIComponent(projectId)}`);
    // ACR may return an array or a single object
    if (Array.isArray(data)) {
      return data[0] ?? null;
    }
    return data ?? null;
  } catch (err) {
    console.warn(`[ACR] getFeaturePlans(${projectId}) failed:`, err);
    return null;
  }
}
