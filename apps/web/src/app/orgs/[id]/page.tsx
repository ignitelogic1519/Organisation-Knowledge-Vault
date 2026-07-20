"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { roles } from "@/lib/orgs-client";
import { courses, downloadBlob, fileToBase64, vaultFiles } from "@/lib/courses-client";
import { GraphLegend, OrgGraph } from "@/components/OrgGraph";
import { useOrg } from "@/components/org-context";

// The org's MAIN page: the constellation. Your chain of roles is highlighted (see legend).
// Clicking a star you govern opens the action drawer (People / Courses / Backup); clicking
// anything else takes a plain member straight to their courses page.

type RoleCourses = Awaited<ReturnType<typeof courses.listForRole>>["courses"];

const governs = (n: TreeNode) =>
  n.my.canAddPeople || n.my.canCreateSubRole || n.my.canManageFlags || n.my.canDelete;

function PeoplePanel({
  node,
  act,
}: {
  node: TreeNode;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div>
      {/* Add form on top — co-owner choice included, per the drawer contract */}
      <form
        className="inline-form"
        style={{ marginTop: 0 }}
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
          <span>Add by username</span>
          <input name="username" required placeholder="their-username" />
        </label>
        <label className="field">
          <span>As</span>
          <select name="kind" defaultValue="MEMBER">
            <option value="MEMBER">Member (learner)</option>
            <option value="OWNER">Co-owner (manages this branch)</option>
          </select>
        </label>
        <label className="ack-row">
          <input type="checkbox" name="delegate" />
          <span>Can create sub-groups</span>
        </label>
        <button className="btn btn-primary btn-small">Add</button>
      </form>

      <h3 className="learning-h">People on this role</h3>
      {(!node.people || node.people.length === 0) && (
        <p className="auth-sub">Nobody placed here yet.</p>
      )}
      <ul className="owner-list">
        {node.people?.map((p) => (
          <li key={`${p.profileId}:${p.kind}`} className="account-row">
            <span>
              {p.kind === "OWNER" && (
                <span className="owner-star" title="Owner / co-owner" aria-label="Owner">
                  ★
                </span>
              )}
              {p.displayName} <span className="auth-sub">@{p.username}</span>{" "}
              <span className="badge">{p.kind === "OWNER" ? "owner" : "member"}</span>
              {p.kind === "OWNER" && p.canCreateSubgroups && (
                <span className="badge badge-ok">delegates</span>
              )}
            </span>
            <span className="tree-actions">
              {node.my.canManageFlags && p.kind === "OWNER" && (
                <button
                  className="btn btn-quiet btn-small"
                  onClick={() =>
                    act(() =>
                      roles.setPersonDelegation(node.id, p.profileId, !p.canCreateSubgroups),
                    )
                  }
                >
                  {p.canCreateSubgroups ? "Revoke delegation" : "Allow delegation"}
                </button>
              )}
              <button
                className="btn btn-danger btn-small"
                onClick={() => act(() => roles.removePerson(node.id, p.profileId))}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoursesPanel({
  node,
  orgId,
  act,
  onError,
}: {
  node: TreeNode;
  orgId: string;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  onError: (m: string) => void;
}) {
  const [list, setList] = useState<RoleCourses | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(() => {
    courses
      .listForRole(node.id)
      .then((r) => setList(r.courses))
      .catch((e) => onError(e instanceof ApiError ? e.message : "Could not load courses"));
  }, [node.id, onError]);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    await act(fn);
    load();
  };

  return (
    <div>
      <button className="btn btn-quiet btn-small" onClick={() => setShowNew((v) => !v)}>
        {showNew ? "Hide new-course form" : "+ New course on this role"}
      </button>

      {showNew && (
        <form
          className="inline-form inline-form-wrap"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const file = d.get("file") as File | null;
            const url = String(d.get("url") || "");
            run(async () => {
              const created = await courses.create(orgId, {
                roleNodeId: node.id,
                kind: (d.get("kind") as "DOCUMENT") ?? "DOCUMENT",
                title: String(d.get("title")),
                url: url || undefined,
                fileBase64: file && file.size > 0 ? await fileToBase64(file) : undefined,
                filename: file && file.size > 0 ? file.name : undefined,
                mime:
                  file && file.size > 0 ? file.type || "application/octet-stream" : undefined,
                deadlineDays: d.get("deadline") ? Number(d.get("deadline")) : undefined,
                retakeEveryNDays: d.get("retake") ? Number(d.get("retake")) : undefined,
                resetsCompletionOnUpdate: d.get("resets") === "on",
                prerequisiteCodes: String(d.get("prereqs") || "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              await courses.place(created.code, {
                roleNodeId: node.id,
                mandatory: d.get("mandatory") === "on",
                inheritToDescendants: d.get("inherit") === "on",
              });
              setShowNew(false);
            });
          }}
        >
          <label className="field">
            <span>Title</span>
            <input name="title" required minLength={2} autoFocus />
          </label>
          <label className="field">
            <span>Kind</span>
            <select name="kind" defaultValue="DOCUMENT">
              <option>DOCUMENT</option>
              <option>BOOK</option>
              <option>LINK</option>
              <option>AUDIO</option>
              <option>VIDEO</option>
            </select>
          </label>
          <label className="field">
            <span>External URL (video/audio/link)</span>
            <input name="url" type="url" placeholder="https://…" />
          </label>
          <label className="field">
            <span>…or small file (≤ 2 MB)</span>
            <input name="file" type="file" />
          </label>
          <label className="field">
            <span>Deadline (days, optional)</span>
            <input name="deadline" type="number" min={1} />
          </label>
          <label className="field">
            <span>Retake every N days (optional)</span>
            <input name="retake" type="number" min={1} />
          </label>
          <label className="field">
            <span>Prerequisite codes (comma-separated)</span>
            <input name="prereqs" placeholder="100-101-0001, …" />
          </label>
          <label className="ack-row">
            <input type="checkbox" name="mandatory" defaultChecked />
            <span>Mandatory</span>
          </label>
          <label className="ack-row">
            <input type="checkbox" name="inherit" defaultChecked />
            <span>Inherit to lower branches</span>
          </label>
          <label className="ack-row">
            <input type="checkbox" name="resets" />
            <span>Updates reset completion</span>
          </label>
          <button className="btn btn-primary btn-small">Publish course</button>
        </form>
      )}

      <h3 className="learning-h">Courses on this role</h3>
      {!list && <p className="auth-sub">Loading…</p>}
      {list?.length === 0 && <p className="auth-sub">No courses placed here yet.</p>}
      <ul className="owner-list">
        {list?.map((c) => (
          <li key={c.code} className="account-row">
            <span>
              {c.title} <span className="chip">{c.code}</span>{" "}
              <span className="badge">{c.kind.toLowerCase()}</span>
            </span>
            <span className="tree-actions">
              <button
                className="btn btn-quiet btn-small"
                title="Toggle whether this course is mandatory here"
                onClick={() =>
                  run(() =>
                    courses.place(c.code, {
                      roleNodeId: node.id,
                      mandatory: !c.mandatory,
                      inheritToDescendants: c.inheritToDescendants,
                    }),
                  )
                }
              >
                {c.mandatory ? "mandatory ✓" : "opt-in"}
              </button>
              <button
                className="btn btn-quiet btn-small"
                title="Toggle inheritance to lower branches"
                onClick={() =>
                  run(() =>
                    courses.place(c.code, {
                      roleNodeId: node.id,
                      mandatory: c.mandatory,
                      inheritToDescendants: !c.inheritToDescendants,
                    }),
                  )
                }
              >
                {c.inheritToDescendants ? "inherits ↓ ✓" : "this role only"}
              </button>
              <button
                className="btn btn-quiet btn-small"
                title="Remove from this branch only — the course keeps existing elsewhere"
                onClick={() => run(() => courses.unplace(c.code, node.id))}
              >
                Unplace
              </button>
              {c.canDelete && (
                <button
                  className="btn btn-danger btn-small"
                  onClick={() => {
                    if (
                      confirm(
                        `Delete "${c.title}" (${c.code}) everywhere?\n\nAll placements disappear. Completion history is kept.`,
                      )
                    )
                      run(() => courses.remove(c.code));
                  }}
                >
                  Delete
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BackupPanel({
  node,
  act,
}: {
  node: TreeNode;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  return (
    <div>
      <p className="auth-sub">
        A <code>.bkp</code> file is an encrypted backup of this branch — roles, people and
        course placements — restorable right here.
      </p>
      <div className="drawer-actions" style={{ marginTop: "0.6rem" }}>
        <button
          className="btn btn-quiet btn-small"
          onClick={() => {
            const pw = prompt(
              "Choose a backup password (minimum 8 characters) — you will need it to restore this .bkp:",
            );
            if (pw === null) return;
            if (pw.length < 8) {
              alert("Backup password must be at least 8 characters — nothing was exported.");
              return;
            }
            act(async () => {
              try {
                const blob = await vaultFiles.exportBkp(node.id, pw);
                downloadBlob(blob, `${node.name}.bkp`);
              } catch (e) {
                alert(e instanceof Error ? e.message : "Backup export failed");
                throw e;
              }
            });
          }}
        >
          ⬇ Download .bkp of this branch
        </button>
      </div>

      <h3 className="learning-h">Restore into this node</h3>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          const file = d.get("bkp") as File;
          act(async () => {
            const res = await vaultFiles.restoreBkp(
              node.id,
              await fileToBase64(file),
              String(d.get("password")),
            );
            alert(
              `Restore report:\nApplied:\n- ${res.report.applied.join("\n- ") || "(nothing)"}\nSkipped:\n- ${res.report.skipped.join("\n- ") || "(nothing)"}`,
            );
          });
        }}
      >
        <label className="field">
          <span>.bkp file</span>
          <input name="bkp" type="file" accept=".bkp" required />
        </label>
        <label className="field">
          <span>Backup password</span>
          <input name="password" type="password" required />
        </label>
        <button className="btn btn-primary btn-small">Restore</button>
      </form>
    </div>
  );
}

function NodeDrawer({
  node,
  orgId,
  onClose,
  onChanged,
}: {
  node: TreeNode;
  orgId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"people" | "courses" | "backup">("people");
  const [subRoleOpen, setSubRoleOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTab("people");
    setSubRoleOpen(false);
    setError(null);
  }, [node.id]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    }
  };

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

      {/* structure quick actions */}
      <div className="drawer-actions">
        {node.my.canCreateSubRole && (
          <button
            className="btn btn-quiet btn-small"
            onClick={() => setSubRoleOpen((v) => !v)}
          >
            + Sub-role
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

      {subRoleOpen && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            act(() =>
              roles.createSubRole(node.id, String(d.get("name")), d.get("terminal") === "on"),
            );
            setSubRoleOpen(false);
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

      {/* the three owner action areas: People · Courses · Backup */}
      {node.my.canAddPeople && (
        <>
          <div className="drawer-tabs" role="tablist">
            <button
              className="drawer-tab"
              role="tab"
              data-active={tab === "people"}
              onClick={() => setTab("people")}
            >
              People
            </button>
            <button
              className="drawer-tab"
              role="tab"
              data-active={tab === "courses"}
              onClick={() => setTab("courses")}
            >
              Courses
            </button>
            <button
              className="drawer-tab"
              role="tab"
              data-active={tab === "backup"}
              onClick={() => setTab("backup")}
            >
              Backup
            </button>
          </div>

          {tab === "people" && <PeoplePanel node={node} act={act} />}
          {tab === "courses" && (
            <CoursesPanel node={node} orgId={orgId} act={act} onError={setError} />
          )}
          {tab === "backup" && <BackupPanel node={node} act={act} />}
        </>
      )}

      {error && <p className="form-error">{error}</p>}
    </aside>
  );
}

export default function OrgConstellationPage() {
  const { org } = useOrg();
  const router = useRouter();
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

  // Members without governance anywhere on the clicked node go straight to their courses
  const onSelect = useCallback(
    (n: TreeNode | null) => {
      if (!n) {
        setSelectedId(null);
        return;
      }
      if (!governs(n)) {
        router.push(`/orgs/${org.id}/learning`);
        return;
      }
      setSelectedId(n.id);
    },
    [org.id, router],
  );

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
          {!selected && <GraphLegend />}
          {selected && (
            <NodeDrawer
              node={selected}
              orgId={org.id}
              onClose={() => setSelectedId(null)}
              onChanged={reload}
            />
          )}
        </>
      )}
    </div>
  );
}
