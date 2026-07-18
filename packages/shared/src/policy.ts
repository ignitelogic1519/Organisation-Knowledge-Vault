import type { PlacementRef, PolicyAction, RoleNodeRef } from "./types.js";

// THE central authorization function (docs/structure.md §2.1). Every permission decision in
// the platform goes through here — no other file may contain permission logic. This is what
// lets the v1 fixed bundle become per-capability switches later without touching call sites.

/** True when `ancestorPath` is the node itself or an ancestor of `nodePath`. */
export function isSelfOrAncestor(ancestorPath: string, nodePath: string): boolean {
  return nodePath === ancestorPath || nodePath.startsWith(`${ancestorPath}.`);
}

/** True when `ancestorPath` is a STRICT ancestor of `nodePath` (not the node itself). */
export function isStrictAncestor(ancestorPath: string, nodePath: string): boolean {
  return nodePath.startsWith(`${ancestorPath}.`);
}

/**
 * v1 rules:
 * - Default: the actor must hold an OWNER placement on the node or any ancestor.
 * - `create_sub_role`: additionally requires the delegation flag on a governing placement
 *   and a non-terminal node.
 * - `manage_flags` / `delete_role` (invariant I6/I5): require an OWNER placement on a
 *   STRICT ancestor — a node's own owners cannot change their own node's flags or delete it;
 *   the layer above (or the org's root Owner role, ancestor of everything) does that.
 */
export function can(
  placements: readonly PlacementRef[],
  action: PolicyAction,
  node: RoleNodeRef,
): boolean {
  if (action === "manage_flags" || action === "delete_role") {
    return placements.some(
      (p) => p.kind === "OWNER" && isStrictAncestor(p.roleNodePath, node.path),
    );
  }

  const governing = placements.filter(
    (p) => p.kind === "OWNER" && isSelfOrAncestor(p.roleNodePath, node.path),
  );
  if (governing.length === 0) return false;

  if (action === "create_sub_role") {
    if (node.isTerminal) return false;
    return governing.some((p) => p.canCreateSubgroups);
  }
  return true;
}
