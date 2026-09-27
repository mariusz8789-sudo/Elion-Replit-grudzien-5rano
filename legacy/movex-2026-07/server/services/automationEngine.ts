import { storage } from "../storage";
import { evaluateConditions, type AutomationAction } from "@shared/automation";
import { executeAiAction } from "./aiActions";
import { dispatchWebhookEvent } from "./webhooks";
import type { AutomationRule } from "@shared/schema";

// Real trigger points wired into existing route call sites - see server/routes.ts. Kept as a
// const list (not a free-text field) so the rule-builder UI has a closed set to offer.
export const AUTOMATION_TRIGGER_EVENTS = [
  { id: "booking.created", label: "Booking created" },
  { id: "booking.status_changed", label: "Booking status changed" },
  { id: "crm_lead.stage_changed", label: "CRM lead stage changed" },
] as const;

export const AUTOMATION_ACTION_TYPES = [
  { id: "send_notification", label: "Send notification" },
  { id: "create_crm_task", label: "Create CRM follow-up task" },
  { id: "assign_driver", label: "Assign a specific driver to the booking" },
  { id: "set_vehicle_availability", label: "Set the booking's vehicle availability" },
  { id: "escalate", label: "Escalate to company owner" },
  { id: "webhook", label: "Fire a custom webhook event" },
  { id: "require_approval", label: "Require owner approval before running an action" },
] as const;

const MAX_AUTOMATION_RETRIES = 3;

interface ActionResult { type: string; success: boolean; message: string }

// Every action re-derives its target from the company + trigger context - never from a
// client-suppliable arbitrary user/company id - so a misconfigured rule can only ever act on
// data the owning company already has legitimate access to (same discipline as aiActions.ts).
async function executeAutomationAction(action: AutomationAction, context: Record<string, unknown>, companyId: string): Promise<ActionResult> {
  const booking = context.booking as Record<string, unknown> | undefined;
  const lead = context.lead as Record<string, unknown> | undefined;

  switch (action.type) {
    case "send_notification": {
      const title = String(action.params.title ?? "Automation notification");
      const message = String(action.params.message ?? "");
      const target = action.params.target === "customer" ? "customer" : "company_owner";
      const userIds = await resolveNotificationTargets(target, companyId, booking);
      for (const userId of userIds) {
        await storage.createNotification({ userId, title, message, link: action.params.link ? String(action.params.link) : undefined });
      }
      return { type: action.type, success: true, message: `Notified ${userIds.length} user(s)` };
    }
    case "escalate": {
      const title = `Escalation: ${String(action.params.title ?? "Automation rule triggered")}`;
      const message = String(action.params.message ?? "An automation rule needs your attention.");
      const userIds = await resolveNotificationTargets("company_owner", companyId, booking);
      for (const userId of userIds) {
        await storage.createNotification({ userId, title, message });
      }
      return { type: action.type, success: true, message: `Escalated to ${userIds.length} owner(s)` };
    }
    case "create_crm_task": {
      const dueInDays = Number(action.params.dueInDays ?? 3);
      const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
      const createdBy = (booking?.userId as string) || (lead?.createdBy as string) || (lead?.assignedTo as string);
      if (!createdBy) return { type: action.type, success: false, message: "No creator context available" };
      await storage.createCrmTask({
        title: String(action.params.title ?? "Automated follow-up"),
        type: (["follow_up", "call", "meeting", "email"].includes(String(action.params.taskType)) ? action.params.taskType : "follow_up") as "follow_up",
        dueDate,
        leadId: lead ? (lead.id as string) : undefined,
        customerId: booking ? (booking.userId as string) : undefined,
      } as any, companyId, createdBy);
      return { type: action.type, success: true, message: "CRM task created" };
    }
    case "assign_driver": {
      const bookingId = booking?.id as string | undefined;
      const driverId = action.params.driverId as string | undefined;
      if (!bookingId || !driverId) return { type: action.type, success: false, message: "Missing bookingId or driverId" };
      const result = await executeAiAction("assign_driver", { bookingId, driverId }, companyId);
      return { type: action.type, success: result.success, message: result.message };
    }
    case "set_vehicle_availability": {
      const vehicleId = booking?.vehicleId as string | undefined;
      if (!vehicleId) return { type: action.type, success: false, message: "Booking has no assigned vehicle" };
      const result = await executeAiAction("set_vehicle_availability", { vehicleId, available: Boolean(action.params.available) }, companyId);
      return { type: action.type, success: result.success, message: result.message };
    }
    case "webhook": {
      const event = String(action.params.event ?? "automation.rule_fired");
      await dispatchWebhookEvent(companyId, event, context);
      return { type: action.type, success: true, message: `Dispatched "${event}" to active subscriptions` };
    }
    default:
      return { type: action.type, success: false, message: `Unknown action type: ${action.type}` };
  }
}

async function resolveNotificationTargets(target: "customer" | "company_owner", companyId: string, booking?: Record<string, unknown>): Promise<string[]> {
  if (target === "customer") {
    return booking?.userId ? [String(booking.userId)] : [];
  }
  const companyUsers = await storage.getCompanyUsers(companyId);
  return companyUsers.filter((u) => u.role === "company").map((u) => u.id);
}

async function runRule(rule: AutomationRule, triggerEvent: string, context: Record<string, unknown>): Promise<void> {
  const actions = rule.actions as AutomationAction[];

  // A rule that requires approval never auto-executes - it logs a pending run and notifies the
  // owner instead; a human must call the approve endpoint to actually run the wrapped action.
  const approvalAction = actions.find((a) => a.type === "require_approval");
  if (approvalAction) {
    const wrapped = approvalAction.params.action as AutomationAction | undefined;
    const run = await storage.createAutomationRun({
      ruleId: rule.id, companyId: rule.companyId, triggerEvent, context,
      status: "pending_approval", actionResults: wrapped ? [wrapped] : [],
    });
    const userIds = await resolveNotificationTargets("company_owner", rule.companyId, context.booking as Record<string, unknown> | undefined);
    for (const userId of userIds) {
      await storage.createNotification({
        userId,
        title: `Approval needed: ${rule.name}`,
        message: String(approvalAction.params.message ?? `Automation rule "${rule.name}" wants to run an action and needs your approval.`),
        link: "/company",
      });
    }
    await storage.writeAuditLog(undefined, "automation.approval_requested", "automation_rule", rule.id, { runId: run.id, triggerEvent }, undefined);
    return;
  }

  const results: ActionResult[] = [];
  for (const action of actions) {
    try {
      results.push(await executeAutomationAction(action, context, rule.companyId));
    } catch (error: any) {
      results.push({ type: action.type, success: false, message: error.message });
    }
  }
  const allSucceeded = results.every((r) => r.success);
  await storage.createAutomationRun({
    ruleId: rule.id, companyId: rule.companyId, triggerEvent, context,
    status: allSucceeded ? "success" : "failed",
    actionResults: results,
    error: allSucceeded ? undefined : results.filter((r) => !r.success).map((r) => r.message).join("; "),
  });
  await storage.writeAuditLog(undefined, "automation.rule_fired", "automation_rule", rule.id, { triggerEvent, success: allSucceeded }, undefined);
}

// Fire-and-forget from route handlers, mirroring the existing dispatchWebhookEvent call
// pattern - never throws, so a misbehaving rule can never break the request that triggered it.
export async function runAutomationRules(companyId: string, triggerEvent: string, context: Record<string, unknown>): Promise<void> {
  const rules = await storage.getCompanyAutomationRulesByTrigger(companyId, triggerEvent);
  for (const rule of rules) {
    if (!evaluateConditions(rule.conditions as any, context)) continue;
    try {
      await runRule(rule, triggerEvent, context);
    } catch (error: any) {
      console.error(`Automation rule ${rule.id} failed to run:`, error.message);
    }
  }
}

// Approve a pending action queued by a "require_approval" action - re-derives the rule from the
// stored run so the approver can't smuggle in different params than what was originally proposed.
export async function approveAutomationRun(runId: string, companyId: string): Promise<{ success: boolean; message: string }> {
  const run = await storage.getAutomationRun(runId);
  if (!run || run.companyId !== companyId || run.status !== "pending_approval") {
    return { success: false, message: "No pending approval found" };
  }
  const wrapped = (run.actionResults as AutomationAction[] | null)?.[0];
  if (!wrapped) {
    await storage.updateAutomationRunStatus(run.id, "rejected", { error: "No wrapped action stored" });
    return { success: false, message: "No wrapped action stored" };
  }
  const result = await executeAutomationAction(wrapped, run.context as Record<string, unknown>, companyId);
  await storage.updateAutomationRunStatus(run.id, result.success ? "approved" : "failed", { actionResults: [result], error: result.success ? undefined : result.message });
  await storage.writeAuditLog(undefined, "automation.approved", "automation_run", run.id, { success: result.success }, undefined);
  return result;
}

export async function rejectAutomationRun(runId: string, companyId: string): Promise<{ success: boolean; message: string }> {
  const run = await storage.getAutomationRun(runId);
  if (!run || run.companyId !== companyId || run.status !== "pending_approval") {
    return { success: false, message: "No pending approval found" };
  }
  await storage.updateAutomationRunStatus(run.id, "rejected");
  await storage.writeAuditLog(undefined, "automation.rejected", "automation_run", run.id, {}, undefined);
  return { success: true, message: "Rejected" };
}

// Background retry sweep - same in-process setInterval pattern as certExpirySweep.ts (no
// external job queue infra exists in this app). Re-runs the exact same action list that failed.
export async function retryFailedAutomationRuns(): Promise<number> {
  const failedRuns = await storage.getFailedAutomationRunsForRetry(MAX_AUTOMATION_RETRIES);
  let retried = 0;
  for (const run of failedRuns) {
    const rule = await storage.getAutomationRule(run.ruleId);
    if (!rule || !rule.enabled) continue;
    const actions = rule.actions as AutomationAction[];
    const results: ActionResult[] = [];
    for (const action of actions) {
      try {
        results.push(await executeAutomationAction(action, run.context as Record<string, unknown>, run.companyId));
      } catch (error: any) {
        results.push({ type: action.type, success: false, message: error.message });
      }
    }
    const allSucceeded = results.every((r) => r.success);
    await storage.updateAutomationRunStatus(run.id, allSucceeded ? "success" : "failed", {
      actionResults: results,
      error: allSucceeded ? undefined : results.filter((r) => !r.success).map((r) => r.message).join("; "),
      retryCount: run.retryCount + 1,
    });
    retried++;
  }
  return retried;
}
