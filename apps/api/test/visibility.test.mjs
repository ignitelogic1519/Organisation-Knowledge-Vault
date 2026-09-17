// Branch visibility tests — the main branch has no visibility (docs/structure.md I7).
//
// Run with `pnpm --filter @vault/api test` (builds first).
//
// Hiding a branch is a real privacy control: it removes the branch from everyone on the
// same layer and below, and cascades to the whole subtree. Applied to the ROOT — the
// branch an organization starts from — it would hide the organization from its own
// members, and it never even worked properly: every place that computes the hidden
// cascade skips the root, so a "hidden" root showed as hidden while its children stayed
// public. The switch is gone; what is tested here is that the rule lives in the central
// policy (so route, UI and structure view all read the same answer) and that it took
// nothing else with it.

import assert from "node:assert/strict";
import test from "node:test";

const { can, isRootRolePath } = await import("@vault/shared");

// A three-level org: root "100", "100.101" beneath it, "100.101.102" beneath that.
const ROOT = { id: "root", orgId: "org", path: "100" };
const SUB = { id: "sub", orgId: "org", path: "100.101" };
const LEAF = { id: "leaf", orgId: "org", path: "100.101.102" };

const owner = (path, id) => ({
  roleNodeId: id,
  roleNodePath: path,
  kind: "OWNER",
  canCreateSubgroups: true,
  canAddCoOwners: true,
  canCreateContent: true,
});
const member = (path, id) => ({
  roleNodeId: id,
  roleNodePath: path,
  kind: "MEMBER",
  canCreateSubgroups: false,
  canAddCoOwners: false,
  canCreateContent: false,
});

// ── Which branch is the main one ─────────────────────────────────────────────

test("the root is the one path with no separator in it", () => {
  // Paths are materialized from role numbers: "100" → "100.101" → "100.101.102".
  assert.equal(isRootRolePath("100"), true);
  assert.equal(isRootRolePath("100.101"), false);
  assert.equal(isRootRolePath("100.101.102"), false);
});

// ── set_visibility ───────────────────────────────────────────────────────────

test("nobody can hide the main branch — not even its own owner", () => {
  assert.equal(can([owner(ROOT.path, ROOT.id)], "set_visibility", ROOT), false);
});

test("an owner can hide the sub-branches below them", () => {
  const rootOwner = [owner(ROOT.path, ROOT.id)];
  assert.equal(can(rootOwner, "set_visibility", SUB), true, "one level down");
  assert.equal(can(rootOwner, "set_visibility", LEAF), true, "and further down");
  assert.equal(
    can([owner(SUB.path, SUB.id)], "set_visibility", SUB),
    true,
    "a branch's own owner publishes or hides it",
  );
});

test("visibility still needs governance — a member cannot touch it", () => {
  assert.equal(can([member(SUB.path, SUB.id)], "set_visibility", SUB), false);
  assert.equal(
    can([owner(LEAF.path, LEAF.id)], "set_visibility", SUB),
    false,
    "authority flows down only — an owner below cannot hide the branch above them",
  );
});

// ── The rule is about visibility, and nothing else ───────────────────────────

test("the root loses its visibility switch, not its governance", () => {
  const rootOwner = [owner(ROOT.path, ROOT.id)];
  assert.equal(can(rootOwner, "add_people", ROOT), true);
  assert.equal(can(rootOwner, "create_sub_role", ROOT), true);
  assert.equal(can(rootOwner, "create_content", ROOT), true);
  // Still true of the root for their own reasons: flags and deletion need the layer
  // ABOVE, and nothing sits above the root.
  assert.equal(can(rootOwner, "manage_flags", ROOT), false);
  assert.equal(can(rootOwner, "delete_role", ROOT), false);
});
