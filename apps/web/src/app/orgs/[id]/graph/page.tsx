"use client";

import { useCallback, useEffect, useState } from "react";
import type { TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";
import { courses } from "@/lib/courses-client";
import { OrgGraph } from "@/components/OrgGraph";
import { useOrg } from "@/components/org-context";

// Constellation tab — the org structure as an interactive star map. Clicking a star opens
// a glass drawer with that role's details and (permission-gated) quick actions.

type RoleCourses = Awaited<ReturnType<typeof courses.listForRole>>["courses"];

function NodeDrawer({
  node,
  onClose,
  onChanged,
}: {
  node: TreeNode;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<"role" | "person" | null>(null);
  const [courseList, setCourseList] = useState<RoleCourses | null>(null);
  const [showCourses, setShowCourses] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(null);
    setShowCourses(false);
    setCourseList(null);
    setError(null);
  }, [node.id]);

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      setForm(null);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  }

  const canDeleteNow =
    node.my.canDelete && node.childCount === 0 && node.ownerCount + node.memberCount === 0;

  return (
    <aside className="node-drawer glass" aria-label={`Role ${node.name}`}>
      <div className="drawer-head">
        <div>
          <h2>{node.name}</h2>
          <p className="auth-sub">role #{node.roleNumber}</p>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="drawer-badges">
        {node.isTerminal && <span className="badge">terminal</span>}
        {node.my.kinds.map((k) => (
          <span key={k} className="badge badge-ok">
            you: {k.toLowerCase()}
          </span>
        ))}
        <span className="badge">
          {node.ownerCount} owner{node.ownerCount === 1 ? "" : "s"}
        </span>
        <span className="badge">
          {node.memberCount} member{node.memberCount === 1 ? "" : "s"}
        </span>
        <span className="badge">
          {node.childCount} sub-role{node.childCount === 1 ? "" : "s"}
        </span>
      </div>

      {(node.my.canCreateSubRole ||
        node.my.canAddPeople ||
        node.my.canManageFlags ||
        canDeleteNow) && (
        <div className="drawer-actions">
          {node.my.canCreateSubRole && (
            <button
              className="btn btn-quiet btn-small"
              onClick={() => setForm(form === "role" ? null : "role")}
            >
              + Sub-role
            </button>
          )}
          {node.my.canAddPeople && (
            <button
              className="btn btn-quiet btn-small"
              onClick={() => setForm(form === "person" ? null : "person")}
            >
              + Person
            </button>
          )}
          {node.my.canAddPeople && (
            <button
              className="btn btn-quiet btn-small"
              onClick={() => {
                const next = !showCourses;
                setShowCourses(next);
                if (next && !courseList) {
                  courses
                    .listForRole(node.id)
                    .then((r) => setCourseList(r.courses))
                    .catch((e) =>
                      setError(e instanceof ApiError ? e.message : "Could not load courses"),
                    );
                }
              }}
            >
              Courses
            </button>
          )}
          {node.my.canManageFlags && (
            <button
              className="btn btn-quiet btn-small"
              title="A terminal role cannot receive sub-roles"
              onClick={() => act(() => roles.setTerminal(node.id, !node.isTerminal))}
            >
              {node.isTerminal ? "Unset terminal" : "Set terminal"}
            </button>
          )}
          {canDeleteNow && (
            <button
              className="btn btn-danger btn-small"
              onClick={() => {
                if (confirm(`Delete the empty role "${node.name}"?`)) {
                  act(() => roles.deleteRole(node.id));
                  onClose();
                }
              }}
            >
              Delete role
            </button>
          )}
        </div>
      )}

      {form === "role" && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            act(() =>
              roles.createSubRole(node.id, String(d.get("name")), d.get("terminal") === "on"),
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

      {form === "person" && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            act(() =>
              roles.addPerson(node.id, {
                username: String(d.get("username")),
                kind: d.get("kind") === "OWNER" ? "OWNER" : "MEMBER",
                canCreateSubgroups: d.get("delegate") === "on",
              }),
            );
          }}
        >
          <label className="field">
            <span>Username</span>
            <input name="username" required autoFocus />
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

      {showCourses && (
        <div>
          <h3 className="learning-h">Courses on this role</h3>
          {!courseList && <p className="auth-sub">Loading…</p>}
          {courseList?.length === 0 && <p className="auth-sub">No courses placed here yet.</p>}
          <ul className="owner-list">
            {courseList?.map((c) => (
              <li key={c.code} className="account-row">
                <span>
                  {c.title} <span className="chip">{c.code}</span>
                </span>
                <span className="badge">{c.mandatory ? "mandatory" : "opt-in"}</span>
              </li>
            ))}
          </ul>
          <p className="auth-sub" style={{ marginTop: "0.4rem" }}>
            Publish and manage courses from the Admin console.
          </p>
        </div>
      )}

      {node.people && node.people.length > 0 && (
        <div>
          <h3 className="learning-h">People</h3>
          <ul className="owner-list">
            {node.people.map((p) => (
              <li key={`${p.profileId}:${p.kind}`} className="account-row">
                <span>
                  {p.displayName} <span className="auth-sub">@{p.username}</span>
                </span>
                <span className="drawer-badges">
                  <span className="badge">{p.kind.toLowerCase()}</span>
                  {node.my.canAddPeople && (
                    <button
                      className="btn btn-danger btn-small"
                      onClick={() => act(() => roles.removePerson(node.id, p.profileId))}
                    >
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="form-error">{error}</p>}
    </aside>
  );
}

export default function GraphPage() {
  const { org } = useOrg();
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const reload = useCallback(() => {
    roles
      .structure(org.id)
      .then((v) => setNodes(v.nodes))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load structure"));
  }, [org.id]);

  useEffect(reload, [reload]);

  const onSelect = useCallback((n: TreeNode | null) => setSelectedId(n?.id ?? null), []);
  const selected = nodes?.find((n) => n.id === selectedId) ?? null;

  return (
    <div className="graph-stage glass">
      {!nodes && !error && <div className="skeleton" style={{ position: "absolute", inset: 0 }} />}
      {error && (
        <p className="form-error" style={{ padding: "1.5rem" }}>
          {error}
        </p>
      )}
      {nodes && (
        <>
          <OrgGraph nodes={nodes} selectedId={selectedId} onSelect={onSelect} />
          <span className="graph-hint glass">
            Drag to pan · scroll or pinch to zoom · click a star to act on it
          </span>
          {selected && (
            <NodeDrawer
              node={selected}
              onClose={() => setSelectedId(null)}
              onChanged={reload}
            />
          )}
        </>
      )}
    </div>
  );
}
