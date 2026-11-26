import { Prisma } from "@prisma/client";

export type AuditEntityType =
  | "Organization"
  | "OrgNode"
  | "Position"
  | "User"
  | "UserProfile"
  | "UserCapability"
  | "UserMfa"
  | "SpaceAccess"
  | "Space"
  | "Page"
  | "PageVersion"
  | "Document"
  | "DocumentVersion"
  | "Course"
  | "CourseAssignment"
  | "QuizAttempt"
  | "Certificate"
  | "InstanceSettings";
export type AuditAction =
  | "Organization.UPDATE"
  | "Organization.EXPORT_ACCESS"
  | "Organization.IMPORT_MEMBERS"
  | "OrgNode.CREATE"
  | "OrgNode.UPDATE"
  | "OrgNode.MOVE"
  | "OrgNode.ARCHIVE"
  | "OrgNode.ASSIGN_MANAGER"
  | "OrgNode.ASSIGN_USER"
  | "Position.CREATE"
  | "Position.UPDATE"
  | "Position.ARCHIVE"
  | "Position.DELETE"
  | "User.UPDATE"
  | "UserProfile.SET_ASSIGNMENT"
  | "UserCapability.SET"
  | "UserMfa.RESET"
  | "User.ISSUE_ACCESS"
  | "SpaceAccess.SET"
  | "SpaceAccess.REMOVE"
  | "Space.CREATE"
  | "Space.UPDATE"
  | "Space.DELETE"
  | "Page.CREATE"
  | "Page.UPDATE"
  | "Page.DELETE"
  | "PageVersion.CREATE"
  | "Document.CREATE"
  | "Document.UPDATE"
  | "Document.DELETE"
  | "DocumentVersion.CREATE"
  | "Course.CREATE"
  | "Course.UPDATE"
  | "Course.PUBLISH"
  | "Course.ARCHIVE"
  | "Course.RESTORE"
  | "Course.DELETE"
  | "CourseAssignment.CREATE"
  | "CourseAssignment.UPDATE"
  | "CourseAssignment.DELETE"
  | "QuizAttempt.GRADE"
  | "Certificate.ISSUE"
  | "InstanceSettings.UPDATE_THEME"
  | "InstanceSettings.SET_ORG_THEMING"
  | "InstanceSettings.SET_BREACH_CHECK"
  | "InstanceSettings.SET_NODE_ISOLATION"
  | "Organization.SET_THEMING"
  | "Organization.SET_ISOLATION";

export interface AuditParams {
  action: AuditAction;
  actorId: string;
  /** null for instance-level changes. */
  organizationId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Anything that can write an audit row: the Prisma service or a transaction client. */
export type AuditDb = Pick<Prisma.TransactionClient, "auditLog">;

/**
 * Write an audit log entry. Pass the transaction client to make it part of
 * the caller's transaction, or the Prisma service to write it on its own.
 */
export async function audit(tx: AuditDb, params: AuditParams): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      organizationId: params.organizationId,
      oldValues: (params.oldValues ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      newValues: (params.newValues ?? undefined) as
        | Prisma.InputJsonValue
        | undefined,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

/**
 * Capture the difference between two objects for audit logging.
 * Only includes changed fields.
 */
export function diff<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { oldValues: Partial<T>; newValues: Partial<T> } {
  const oldValues: Partial<T> = {};
  const newValues: Partial<T> = {};
  for (const key of Object.keys(after)) {
    const beforeVal = before[key];
    const afterVal = after[key];
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      (oldValues as Record<string, unknown>)[key] = beforeVal;
      (newValues as Record<string, unknown>)[key] = afterVal;
    }
  }
  return { oldValues, newValues };
}
