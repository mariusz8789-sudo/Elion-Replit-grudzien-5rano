import { storage } from "../storage";

// Real, deterministic certification/license expiry check - no external cron infra exists in
// this app, so this runs on a plain setInterval from server/index.ts (once at boot, then daily).
// Reuses the existing verificationDocuments table and notifications system rather than adding
// a parallel reminder mechanism.
const EXPIRY_WARNING_DAYS = 30;

export async function runCertificationExpirySweep(): Promise<number> {
  const expiring = await storage.getExpiringVerificationDocuments(EXPIRY_WARNING_DAYS);
  let notified = 0;

  for (const doc of expiring) {
    const recipientUserIds = await resolveHolderUserIds(doc.holderType, doc.holderId);
    const daysLeft = doc.expiresAt ? Math.max(0, Math.ceil((doc.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))) : null;

    for (const userId of recipientUserIds) {
      await storage.createNotification({
        userId,
        title: "Certification expiring soon",
        message: daysLeft != null
          ? `Your "${doc.docType}" certification expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}. Renew it to keep matching for jobs that require it.`
          : `Your "${doc.docType}" certification is expiring soon. Renew it to keep matching for jobs that require it.`,
        link: "/skills-profile",
      });
    }
    await storage.markVerificationDocumentExpiryNotified(doc.id);
    notified++;
  }

  return notified;
}

async function resolveHolderUserIds(holderType: string, holderId: string): Promise<string[]> {
  if (holderType === "user") return [holderId];
  if (holderType === "driver") {
    const driver = await storage.getDriver(holderId);
    return driver ? [driver.userId] : [];
  }
  if (holderType === "company") {
    const companyUsers = await storage.getCompanyUsers(holderId);
    return companyUsers.map((u) => u.id);
  }
  return [];
}
