"use client";

import { useMemo } from "react";
import type { MyPlacement } from "@vault/shared";

// Where the reader stands in an organization, as chips.
//
// One person can hold several positions at once — owning one branch while sitting as a
// member in three others is ordinary, not an edge case — so this has to survive a long
// list without pushing everything else off the card or off the header. Owners come first
// (that is what changes what the reader can DO), and the tail becomes a count rather than
// growing without limit. The same component serves the dashboard card and the
// organization's own header, so a position looks the same wherever it is mentioned.

export function RoleChips({
  placements,
  limit = 3,
  /** Shown in place of nothing when the reader holds no explicit placement. */
  fallback = "Member",
}: {
  placements: MyPlacement[];
  limit?: number;
  fallback?: string;
}) {
  const ordered = useMemo(
    () =>
      [...placements].sort(
        (a, b) =>
          Number(b.kind === "OWNER") - Number(a.kind === "OWNER") ||
          a.roleName.localeCompare(b.roleName),
      ),
    [placements],
  );

  if (ordered.length === 0) {
    return (
      <span className="role-chips">
        <span className="role-chip" data-kind="MEMBER">
          {fallback}
        </span>
      </span>
    );
  }

  const shown = ordered.slice(0, limit);
  const rest = ordered.slice(limit);

  return (
    <span className="role-chips">
      {shown.map((p) => (
        <span
          key={p.roleNodeId}
          className="role-chip"
          data-kind={p.kind}
          data-hint={
            p.kind === "OWNER"
              ? `You govern ${p.roleName} (#${p.roleNumber}) — you can add people to it and publish to it.`
              : `You are a member of ${p.roleName} (#${p.roleNumber}).`
          }
          data-hint-title={p.kind === "OWNER" ? "Owner" : "Member"}
        >
          {p.kind === "OWNER" && (
            <span className="role-chip-mark" aria-hidden>
              ★
            </span>
          )}
          {p.roleName}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          className="role-chip role-chip-more"
          data-hint={rest.map((p) => `${p.roleName} — ${p.kind.toLowerCase()}`).join("\n")}
          data-hint-title={`${rest.length} more position${rest.length === 1 ? "" : "s"}`}
        >
          +{rest.length}
        </span>
      )}
    </span>
  );
}
