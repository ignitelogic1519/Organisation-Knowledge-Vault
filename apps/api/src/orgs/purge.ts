import { db } from "../db.js";

/** Hard-delete every trace of an organization. Used by the 30-day purge job and by
 *  .main revival replacing a still-retained soft-deleted org.
 *
 *  **Objects in the organization's OWN storage are deliberately left alone.** Purging
 *  removes *our* records; their bucket is theirs, and their files plus the map plus
 *  their `.main` file are exactly the recovery path §9.11 promises them. Wiping a
 *  customer's own hardware because our retention window closed would break that promise
 *  — and an organization that wants the objects gone can empty the bucket itself.
 *
 *  Any deletions already queued for this org (from individual course deletes) are
 *  dropped with the rest of our records, because the credentials to act on them go with
 *  the OrgStorage row. */
export async function purgeOrganization(orgId: string): Promise<void> {
  await db.$transaction([
    db.completionRecord.deleteMany({ where: { orgId } }),
    db.courseAdminAccess.deleteMany({ where: { course: { orgId } } }),
    db.courseReview.deleteMany({ where: { course: { orgId } } }),
    // Both sides of the prerequisite link: a course in this org may be REQUIRED BY a
    // course elsewhere, and that row points at it too.
    db.coursePrerequisite.deleteMany({
      where: { OR: [{ course: { orgId } }, { requires: { orgId } }] },
    }),
    db.coursePlacement.deleteMany({ where: { course: { orgId } } }),
    // Sittings reference their course under a RESTRICT constraint, so they must go
    // before it or the whole purge fails on the foreign key.
    db.examAttempt.deleteMany({ where: { orgId } }),
    db.course.deleteMany({ where: { orgId } }),
    db.storedFile.deleteMany({ where: { orgId } }),
    db.storageObject.deleteMany({ where: { orgId } }),
    db.storageDeletion.deleteMany({ where: { orgId } }),
    db.invitation.deleteMany({ where: { orgId } }),
    db.vaultRequest.deleteMany({ where: { orgId } }),
    db.placement.deleteMany({ where: { membership: { orgId } } }),
    db.membership.deleteMany({ where: { orgId } }),
    db.roleNode.deleteMany({ where: { orgId } }),
    db.supremeAudit.deleteMany({ where: { orgId } }),
    db.auditLog.deleteMany({ where: { orgId } }),
    db.organization.delete({ where: { id: orgId } }),
  ]);
}
