// Core vocabulary of the platform — mirrors docs/structure.md.
// These types are the contract between web, api, and (later) mobile.

export type PlacementKind = "OWNER" | "MEMBER";

export type CourseKind = "DOCUMENT" | "BOOK" | "LINK" | "AUDIO" | "VIDEO"; // EXAM: post-v1

export type CompletionStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED";

export type AccessLevel = "VIEW" | "EDIT";

/** Actions checked by the central policy function (v1 fixed capability bundle). */
export type PolicyAction =
  | "create_content"
  | "add_people"
  | "create_sub_role"
  | "manage_flags"
  | "delete_role"
  | "export_backup"
  | "restore_backup";

export interface RoleNodeRef {
  id: string;
  orgId: string;
  /** Materialized path, e.g. "root.hr.assistant_hr" — ancestor checks are prefix tests. */
  path: string;
  isTerminal: boolean;
}

export interface PlacementRef {
  roleNodeId: string;
  roleNodePath: string;
  kind: PlacementKind;
  canCreateSubgroups: boolean;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  time: string;
  /** Active mail provider; "log-only" means mails go to the server log instead of sending. */
  mail?: "brevo" | "smtp" | "log-only";
}
