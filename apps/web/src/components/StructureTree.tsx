"use client";

import { useCallback, useEffect, useState } from "react";
import type { TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";

// My Structure — the user's slice of the role tree (docs/structure.md §6).
// Roles render as an indented tree; governed nodes expose management actions.

export function StructureTree({ orgId }: { orgId: string }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState<string | null>(null); // "<nodeId>:role" | "<nodeId>:person"

  const reload = useCallback(() => {
    roles
      .structure(orgId)
      .then((v) => setNodes(v.nodes))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load structure"));
  }, [orgId]);

  useEffect(reload, [reload]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      reload();
      setOpenForm(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  if (!nodes) return <p className="auth-sub">{error ?? "Loading structure…"}</p>;

  const depth = (n: TreeNode) => n.path.split(".").length - 1;

  return (
    <div className="tree">
      {error && <p className="form-error">{error}</p>}
      {nodes.map((n) => (
        <div key={n.id} className="tree-node" style={{ marginLeft: `${depth(n) * 1.25}rem` }}>
          <div className="tree-row">
            <div className="tree-title">
              <strong>{n.name}</strong> <span className="chip">#{n.roleNumber}</span>
              {n.isTerminal && <span className="badge">terminal</span>}
              {n.my.kinds.map((k) => (
                <span key={k} className="badge badge-ok">
                  you: {k.toLowerCase()}
                </span>
              ))}
              <span className="auth-sub">
                {n.ownerCount} owner{n.ownerCount === 1 ? "" : "s"} · {n.memberCount} member
                {n.memberCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="tree-actions">
              {n.my.canCreateSubRole && (
                <button
                  className="btn btn-quiet btn-small"
                  onClick={() => setOpenForm(openForm === `${n.id}:role` ? null : `${n.id}:role`)}
                >
                  + Sub-role
                </button>
              )}
              {n.my.canAddPeople && (
                <button
                  className="btn btn-quiet btn-small"
                  onClick={() =>
                    setOpenForm(openForm === `${n.id}:person` ? null : `${n.id}:person`)
                  }
                >
                  + Person
                </button>
              )}
              {n.my.canManageFlags && (
                <button
                  className="btn btn-quiet btn-small"
                  onClick={() => act(() => roles.setTerminal(n.id, !n.isTerminal))}
                  title="A terminal role cannot receive sub-roles"
                >
                  {n.isTerminal ? "Unset terminal" : "Set terminal"}
                </button>
              )}
              {n.my.canDelete && n.childCount === 0 && n.ownerCount + n.memberCount === 0 && (
                <button
                  className="btn btn-danger btn-small"
                  onClick={() => act(() => roles.deleteRole(n.id))}
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          {openForm === `${n.id}:role` && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                act(() =>
                  roles.createSubRole(n.id, String(d.get("name")), d.get("terminal") === "on"),
                );
              }}
            >
              <label className="field">
                <span>New sub-role name</span>
                <input name="name" required minLength={2} autoFocus />
              </label>
              <label className="ack-row">
                <input type="checkbox" name="terminal" />
                <span>Terminal</span>
              </label>
              <button className="btn btn-primary btn-small">Create</button>
            </form>
          )}

          {openForm === `${n.id}:person` && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const d = new FormData(e.currentTarget);
                act(() =>
                  roles.addPerson(n.id, {
                    email: String(d.get("email")),
                    kind: d.get("kind") === "OWNER" ? "OWNER" : "MEMBER",
                    canCreateSubgroups: d.get("delegate") === "on",
                  }),
                );
              }}
            >
              <label className="field">
                <span>Email</span>
                <input name="email" type="email" required autoFocus />
              </label>
              <label className="field">
                <span>As</span>
                <select name="kind" defaultValue="MEMBER">
                  <option value="MEMBER">Member (learner)</option>
                  <option value="OWNER">Owner (manages this role)</option>
                </select>
              </label>
              <label className="ack-row">
                <input type="checkbox" name="delegate" />
                <span>Can create sub-groups</span>
              </label>
              <button className="btn btn-primary btn-small">Add</button>
            </form>
          )}

          {n.people && n.people.length > 0 && (
            <ul className="owner-list tree-people">
              {n.people.map((p) => (
                <li key={`${p.profileId}:${p.kind}`} className="account-row">
                  <span>
                    {p.displayName} <span className="auth-sub">{p.email}</span>{" "}
                    <span className="badge">{p.kind.toLowerCase()}</span>
                    {p.kind === "OWNER" && p.canCreateSubgroups && (
                      <span className="badge badge-ok">delegates</span>
                    )}
                  </span>
                  <span className="tree-actions">
                    {n.my.canManageFlags && p.kind === "OWNER" && (
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() =>
                          act(() =>
                            roles.setPersonDelegation(n.id, p.profileId, !p.canCreateSubgroups),
                          )
                        }
                      >
                        {p.canCreateSubgroups ? "Revoke delegation" : "Allow delegation"}
                      </button>
                    )}
                    {n.my.canAddPeople && (
                      <button
                        className="btn btn-danger btn-small"
                        onClick={() => act(() => roles.removePerson(n.id, p.profileId))}
                      >
                        Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
