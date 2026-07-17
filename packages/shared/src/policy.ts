import type { PlacementRef, PolicyAction, RoleNodeRef } from "./types.js";

// THE central authorization function (docs/structure.md §2.1). Every permission decision in
// the platform goes through here — no other file may contain permission logic. This is what
// lets the v1 fixed bundle become per-capability switches later without touching call sites.

/** True when `ancestorPath` is the node itself or an ancestor of `nodePath`. */
export function isSelfOrAncestor(ancestorPath: string, nodePath: string): boolean {
  return nodePath === ancestorPath || nodePath.startsWith(`${ancestorPath}.`);
}

/**
 * v1 rule: the actor must hold an OWNER placement on the node or any ancestor.
 * `create_sub_role` additionally requires the delegation flag and a non-terminal node.
 */
export function can(
  placements: readonly PlacementRef[],
  action: PolicyAction,
  node: RoleNodeRef,
): boolean {
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
