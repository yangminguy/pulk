// Project Status Builder — generates a human-readable STATUS.md for a business.
// Pure function: no I/O, no external dependencies.

export interface ProjectStatusInput {
  business: {
    id: string;
    name: string;
    one_liner?: string;
    current_phase?: string;
    lifecycle_stage?: string;
  };
  agentTasks: Array<{
    id: string;
    title: string;
    assigned_agent: string;
    risk_level: "D1" | "D2" | "D3" | "D4" | "D5";
    status: string;
    created_at: string;
    updated_at?: string;
    rationale?: string;
    pii_level?: string;
  }>;
  handoffs?: Array<{
    from_agent: string;
    to_agent: string;
    payload?: unknown;
    at: string;
  }>;
  ctoPlan?: {
    plan_id?: string;
    phases?: Array<{
      name: string;
      runtime?: string;
      status: "todo" | "running" | "done" | "failed" | "planned" | "in_progress";
      updated_at?: string;
    }>;
  };
  openItems?: Array<{
    kind: "needs_review" | "blocked" | "pending_approval";
    task_id: string;
    note?: string;
  }>;
  insights?: Array<{ at: string; note: string }>;
  generatedAt: string;
}

const STATUS_ICON: Record<string, string> = {
  done: "✅",
  running: "🟡",
  in_progress: "🟡",
  failed: "❌",
  planned: "⏳",
  todo: "⏳",
  blocked: "🛑",
};

function statusIcon(s: string): string {
  return STATUS_ICON[s] ?? "⏳";
}

// Mask anything that looks like a PII email pattern.
const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

function maskPii(text: string): string {
  return text.replace(EMAIL_RE, "[masked]");
}

function isoToShort(iso: string): string {
  // Returns "YYYY-MM-DD HH:MM" from ISO string, safe-fallback to raw.
  try {
    return iso.slice(0, 16).replace("T", " ");
  } catch {
    return iso;
  }
}

export function buildProjectStatusMarkdown(input: ProjectStatusInput): string {
  const { business, agentTasks, handoffs, ctoPlan, openItems, insights, generatedAt } = input;

  const lines: string[] = [];

  // Header
  const oneLiner = business.one_liner ?? "—";
  lines.push(`# ${business.name} — ${oneLiner}`);
  lines.push(`Last updated: ${generatedAt}`);
  lines.push(
    `Phase: ${business.current_phase ?? "—"} · Lifecycle: ${business.lifecycle_stage ?? "—"}`,
  );
  lines.push("");

  // Active CTO Plan
  lines.push("## Active CTO Plan");
  if (ctoPlan) {
    lines.push(`- plan_id: ${ctoPlan.plan_id ?? "—"}`);
    if (ctoPlan.phases && ctoPlan.phases.length > 0) {
      lines.push("- phases:");
      for (const phase of ctoPlan.phases) {
        const icon = statusIcon(phase.status);
        const runtimePart = phase.runtime ? ` · ${phase.runtime}` : "";
        const datePart = phase.updated_at ? ` (${isoToShort(phase.updated_at)}${runtimePart})` : runtimePart ? ` (${runtimePart})` : "";
        lines.push(`  - ${phase.name} ${icon} ${phase.status}${datePart}`);
      }
    } else {
      lines.push("  (no phases)");
    }
  } else {
    lines.push("- plan_id: —");
    lines.push("  (no active plan)");
  }
  lines.push("");

  // Recent Agent Activity (last 20)
  lines.push("## Recent Agent Activity (last 20)");
  lines.push("| when | agent | what | risk | status |");
  lines.push("|---|---|---|---|---|");

  // Sort by updated_at or created_at descending, cap at 20
  const sorted = [...agentTasks]
    .sort((a, b) => {
      const aTime = a.updated_at ?? a.created_at;
      const bTime = b.updated_at ?? b.created_at;
      return bTime.localeCompare(aTime);
    })
    .slice(0, 20);

  for (const task of sorted) {
    const when = isoToShort(task.updated_at ?? task.created_at);
    const agent = task.assigned_agent;
    // Skip description/rationale if pii_level is high; show masked title only.
    const isPii = task.pii_level === "high";
    const what = isPii ? maskPii(task.title) : maskPii(task.title);
    const icon = statusIcon(task.status);
    lines.push(`| ${when} | ${agent} | ${what} | ${task.risk_level} | ${icon} ${task.status} |`);
  }

  if (sorted.length === 0) {
    lines.push("| — | — | (no activity) | — | — |");
  }
  lines.push("");

  // Open Decisions / Blockers
  lines.push("## Open Decisions / Blockers");
  if (openItems && openItems.length > 0) {
    for (const item of openItems) {
      const icon = item.kind === "blocked" ? "🛑" : item.kind === "pending_approval" ? "⏳" : "👀";
      const note = item.note ? `: ${item.note}` : "";
      lines.push(`- ${icon} [${item.kind}] task ${item.task_id}${note}`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");

  // Insights → Memory
  lines.push("## Insights → Memory");
  if (insights && insights.length > 0) {
    for (const ins of insights) {
      lines.push(`- ${isoToShort(ins.at)} — ${maskPii(ins.note)}`);
    }
  } else {
    lines.push("- (none)");
  }
  lines.push("");

  return lines.join("\n");
}
