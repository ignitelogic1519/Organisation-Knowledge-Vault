import { db } from "../db.js";

/** Hard-delete every trace of an organization. Used by the 30-day purge job and by
 *  .main revival replacing a still-retained soft-deleted org. */
export async function purgeOrganization(orgId: string): Promise<void> {
  await db.$transaction([
    db.completionRecord.deleteMany({ where: { orgId } }),
    db.courseAdminAccess.deleteMany({ where: { course: { orgId } } }),
    db.coursePrerequisite.deleteMany({ where: { course: { orgId } } }),
    db.coursePlacement.deleteMany({ where: { course: { orgId } } }),
    db.course.deleteMany({ where: { orgId } }),
    db.storedFile.deleteMany({ where: { orgId } }),
    db.invitation.deleteMany({ where: { orgId } }),
    db.vaultRequest.deleteMany({ where: { orgId } }),
    db.placement.deleteMany({ where: { membership: { orgId } } }),
    db.membership.deleteMany({ where: { orgId } }),
    db.roleNode.deleteMany({ where: { orgId } }),
    db.supremeAudit.deleteMany({ where: { orgId } }),
    db.organization.delete({ where: { id: orgId } }),
  ]);
}
