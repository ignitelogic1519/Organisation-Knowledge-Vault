"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { TreeNode } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { orgs, requests, roles } from "@/lib/orgs-client";
import { courses, downloadBlob, fileToBase64, vaultFiles } from "@/lib/courses-client";
import { GraphLegend, OrgGraph } from "@/components/OrgGraph";
import { useOrg } from "@/components/org-context";
import { useDialogs } from "@/components/dialogs";
import {
  IconArchive,
  IconBook,
  IconSettings,
  IconUsers,
} from "@/components/icons";

// The org's MAIN page: the constellation. Your chain of roles is highlighted (see legend).
// Clicking a star you govern opens the action panel — first a section chooser
// (Group configuration / People / Courses / Backup), then the chosen section.
// Clicking a node you have no access to says so instead of navigating anywhere.

type RoleCourses = Awaited<ReturnType<typeof courses.listForRole>>["courses"];
type Section = "config" | "people" | "courses" | "backup";

const governs = (n: TreeNode) =>
  n.my.canAddPeople || n.my.canCreateSubRole || n.my.canManageFlags || n.my.canDelete;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/* ── Section: Group configuration ────────────────────────────────────────── */

function ConfigPanel({
  node,
  act,
  onClose,
}: {
  node: TreeNode;
  act: (fn: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const { org, reload, isSupremeOwner } = useOrg();
  const dialogs = useDialogs();
  const router = useRouter();
  const [subRoleOpen, setSubRoleOpen] = useState(false);
  const [supremeToken, setSupremeToken] = useState<string | null>(null);
  const [supremePassword, setSupremePassword] = useState<string | null>(null);
  const isRoot = node.parentId === null;

  const unlockSupreme = async (): Promise<string | null> => {
    if (supremeToken) return supremeToken;
    const pw = await dialogs.promptPassword({
      title: "Supreme access",
      message:
        "Owner-level changes need the organization's Supreme password. Access lasts 10 minutes.",
      label: "Supreme password",
      submitLabel: "Unlock",
      minLength: 1,
    });
    if (!pw) return null;
    try {
      const session = await orgs.supremeVerify(org.id, pw);
      setSupremeToken(session.supremeToken);
      setSupremePassword(pw);
      dialogs.toast("Supreme access granted for 10 minutes.", "success");
      return session.supremeToken;
    } catch (e) {
      dialogs.toast(e instanceof ApiError ? e.message : "Verification failed", "danger");
      return null;
    }
  };

  return (
    <div className="drawer-section">
      {/* visibility */}
      <div className="config-row">
        <div>
          <strong>Public branch</strong>
          <p className="auth-sub">
            Public branches are visible to every member of the organization, who can ask to
            join with a Join request.
          </p>
        </div>
        <button
          className={node.isPublic ? "btn btn-primary btn-small" : "btn btn-quiet btn-small"}
          onClick={() => act(() => roles.setPublic(node.id, !node.isPublic))}
        >
          {node.isPublic ? "Public ✓" : "Make public"}
        </button>
      </div>

      {/* structure */}
      {node.my.canCreateSubRole && (
        <div className="config-row">
          <div>
            <strong>Sub-groups</strong>
            <p className="auth-sub">Grow the branch downward with a new sub-role.</p>
          </div>
          <button
            className="btn btn-quiet btn-small"
            onClick={() => setSubRoleOpen((v) => !v)}
          >
            + Sub-role
          </button>
        </div>
      )}
      {subRoleOpen && (
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            act(() => roles.createSubRole(node.id, String(d.get("name"))));
            setSubRoleOpen(false);
          }}
        >
          <label className="field">
            <span>New sub-role name</span>
            <input name="name" required minLength={2} autoFocus />
          </label>
          <button className="btn btn-primary btn-small">Create</button>
        </form>
      )}

      {/* deletion — direct for the layer above, by request for the branch's own owners */}
      {!isRoot && node.my.canDelete && (
        <div className="config-row">
          <div>
            <strong>Delete this branch</strong>
            <p className="auth-sub">Only possible while it has no sub-roles and no people.</p>
          </div>
          <button
            className="btn btn-danger btn-small"
            onClick={async () => {
              if (
                await dialogs.confirm({
                  title: "Delete branch",
                  message: `Delete the role "${node.name}"? It must be empty — no sub-roles, no people.`,
                  confirmLabel: "Delete",
                  danger: true,
                })
              ) {
                await act(() => roles.deleteRole(node.id));
                onClose();
              }
            }}
          >
            Delete
          </button>
        </div>
      )}
      {!isRoot && node.my.canRequestDelete && (
        <div className="config-row">
          <div>
            <strong>Request deletion</strong>
            <p className="auth-sub">
              Deleting a branch needs approval from the level above — this files a Deletion
              request with them.
            </p>
          </div>
          <button
            className="btn btn-danger btn-small"
            onClick={async () => {
              if (
                await dialogs.confirm({
                  title: "Deletion request",
                  message: `Ask the level above to delete "${node.name}"? They approve or reject it from their Requests inbox.`,
                  confirmLabel: "Send request",
                  danger: true,
                })
              ) {
                await act(async () => {
                  await requests.create(org.id, {
                    kind: "DELETE_BRANCH",
                    targetRoleNodeId: node.id,
                  });
                  dialogs.toast("Deletion request sent to the level above.", "success");
                });
              }
            }}
          >
            Request
          </button>
        </div>
      )}

      {/* Supreme zone — root node only, replaces the old Admin console */}
      {isRoot && isSupremeOwner && (
        <>
          <h3 className="learning-h">Supreme zone</h3>
          <p className="auth-sub">
            Owners of {org.ownerRole.name}. Changes require the Supreme password.
          </p>
          <ul className="people-list">
            {org.owners.map((o) => (
              <li key={o.profileId} className="person-card">
                <span className="avatar" aria-hidden>
                  {initialsOf(o.displayName)}
                </span>
                <span className="person-main">
                  <span className="person-name">{o.displayName}</span>
                  <span className="person-sub">@{o.username}</span>
                </span>
                {org.owners.length > 1 && (
                  <button
                    className="btn btn-danger btn-small"
                    onClick={async () => {
                      const token = await unlockSupreme();
                      if (!token) return;
                      try {
                        await orgs.removeOwner(org.id, o.profileId, token);
                        reload();
                      } catch (e) {
                        dialogs.toast(
                          e instanceof ApiError ? e.message : "Could not remove owner",
                          "danger",
                        );
                      }
                    }}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const username = String(new FormData(form).get("username"));
              const token = await unlockSupreme();
              if (!token) return;
              try {
                await orgs.addOwner(org.id, username, token);
                form.reset();
                reload();
              } catch (err) {
                dialogs.toast(
                  err instanceof ApiError ? err.message : "Could not add owner",
                  "danger",
                );
              }
            }}
          >
            <label className="field">
              <span>Add supreme co-owner by username</span>
              <input name="username" placeholder="their-username" required />
            </label>
            <button className="btn btn-primary btn-small">Add owner</button>
          </form>

          <div className="config-row">
            <div>
              <strong>.main existence backup</strong>
              <p className="auth-sub">
                Encrypted with the Supreme password — the only way to revive the organization
                after purge.
              </p>
            </div>
            <button
              className="btn btn-quiet btn-small"
              onClick={async () => {
                const token = await unlockSupreme();
                if (!token) return;
                const pw =
                  supremePassword ??
                  (await dialogs.promptPassword({
                    title: "Export .main",
                    message: "The Supreme password encrypts the .main file.",
                    label: "Supreme password",
                    minLength: 1,
                  }));
                if (!pw) return;
                try {
                  const blob = await vaultFiles.exportMain(org.id, pw, token);
                  downloadBlob(blob, `${org.name}.main`);
                  dialogs.toast(".main downloaded — keep it safe.", "success");
                } catch (e) {
                  dialogs.toast(e instanceof Error ? e.message : "Export failed", "danger");
                }
              }}
            >
              ⬇ Download
            </button>
          </div>

          <div className="config-row">
            <div>
              <strong className="danger-text">Delete organization</strong>
              <p className="auth-sub">
                30-day retention, then only the .main file can revive it.
              </p>
            </div>
            <button
              className="btn btn-danger btn-small"
              onClick={async () => {
                const token = await unlockSupreme();
                if (!token) return;
                if (
                  !(await dialogs.confirm({
                    title: "Delete organization",
                    message:
                      "Download the .main file FIRST — after the 30-day retention it is the ONLY way to revive the organization. Delete anyway?",
                    confirmLabel: "Delete organization",
                    danger: true,
                  }))
                )
                  return;
                try {
                  const res = await vaultFiles.deleteOrg(org.id, token);
                  await dialogs.alert({
                    title: "Organization deleted",
                    message: `Data retained until ${res.retainedUntil.slice(0, 10)} — after that, only the .main file can revive it.`,
                    tone: "danger",
                  });
                  router.replace("/orgs");
                } catch (e) {
                  dialogs.toast(e instanceof Error ? e.message : "Deletion failed", "danger");
                }
              }}
            >
              Delete…
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Section: People ─────────────────────────────────────────────────────── */

function PeoplePanel({
  node,
  act,
}: {
  node: TreeNode;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const dialogs = useDialogs();
  const [addOpen, setAddOpen] = useState(false);
  const owners = node.people?.filter((p) => p.kind === "OWNER") ?? [];
  const members = node.people?.filter((p) => p.kind === "MEMBER") ?? [];

  return (
    <div className="drawer-section">
      <button
        className={addOpen ? "btn btn-quiet btn-small" : "btn btn-primary btn-small"}
        onClick={() => setAddOpen((v) => !v)}
      >
        {addOpen ? "Close form" : "+ Add person"}
      </button>

      {addOpen && (
        <form
          className="add-person-form"
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            act(() =>
              roles.addPerson(node.id, {
                username: String(d.get("username")),
                kind: d.get("kind") === "OWNER" ? "OWNER" : "MEMBER",
                canCreateSubgroups: d.get("delegate") === "on",
                canAddCoOwners: d.get("coowners") === "on",
              }),
            );
            setAddOpen(false);
          }}
        >
          <label className="field">
            <span>Username</span>
            <input name="username" required placeholder="their-username" autoFocus />
            <small>Unknown usernames are reserved and attach when they register</small>
          </label>
          <label className="field">
            <span>Position</span>
            <select name="kind" defaultValue="MEMBER">
              <option value="MEMBER">Member — learns from this branch</option>
              {node.my.canAddCoOwners && (
                <option value="OWNER">Co-owner — manages this branch</option>
              )}
            </select>
          </label>
          {node.my.canGrantSubgroups && (
            <label className="ack-row">
              <input type="checkbox" name="delegate" />
              <span>Co-owner may create sub-groups</span>
            </label>
          )}
          {node.my.canAddCoOwners && (
            <label className="ack-row">
              <input type="checkbox" name="coowners" />
              <span>Co-owner may appoint further co-owners</span>
            </label>
          )}
          <button className="btn btn-primary btn-small">Add to {node.name}</button>
        </form>
      )}

      {(!node.people || node.people.length === 0) && (
        <p className="auth-sub">Nobody placed here yet — add the first person above.</p>
      )}

      {owners.length > 0 && (
        <>
          <h3 className="learning-h">Owners · {owners.length}</h3>
          <ul className="people-list">
            {owners.map((p) => (
              <li key={p.profileId} className="person-card">
                <span className="avatar avatar-owner" aria-hidden>
                  {initialsOf(p.displayName)}
                </span>
                <span className="person-main">
                  <span className="person-name">{p.displayName}</span>
                  <span className="person-sub">@{p.username}</span>
                  <span className="person-chips">
                    {p.canCreateSubgroups && <span className="badge badge-ok">sub-groups</span>}
                    {p.canAddCoOwners && <span className="badge badge-ok">appoints co-owners</span>}
                  </span>
                </span>
                <span className="person-actions">
                  {node.my.canManageFlags && (
                    <>
                      <button
                        className="btn btn-quiet btn-small"
                        title="Toggle whether this owner can create sub-groups"
                        onClick={() =>
                          act(() =>
                            roles.setPersonFlags(node.id, p.profileId, {
                              canCreateSubgroups: !p.canCreateSubgroups,
                            }),
                          )
                        }
                      >
                        {p.canCreateSubgroups ? "Revoke sub-groups" : "Allow sub-groups"}
                      </button>
                      <button
                        className="btn btn-quiet btn-small"
                        title="Toggle whether this owner can appoint co-owners"
                        onClick={() =>
                          act(() =>
                            roles.setPersonFlags(node.id, p.profileId, {
                              canAddCoOwners: !p.canAddCoOwners,
                            }),
                          )
                        }
                      >
                        {p.canAddCoOwners ? "Revoke co-owner rights" : "Allow co-owner rights"}
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-danger btn-small"
                    onClick={async () => {
                      if (
                        await dialogs.confirm({
                          title: "Remove owner",
                          message: `Remove ${p.displayName} (@${p.username}) from "${node.name}"?`,
                          confirmLabel: "Remove",
                          danger: true,
                        })
                      )
                        act(() => roles.removePerson(node.id, p.profileId));
                    }}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {members.length > 0 && (
        <>
          <h3 className="learning-h">Members · {members.length}</h3>
          <ul className="people-list">
            {members.map((p) => (
              <li key={p.profileId} className="person-card">
                <span className="avatar" aria-hidden>
                  {initialsOf(p.displayName)}
                </span>
                <span className="person-main">
                  <span className="person-name">{p.displayName}</span>
                  <span className="person-sub">@{p.username}</span>
                </span>
                <span className="person-actions">
                  <button
                    className="btn btn-danger btn-small"
                    onClick={async () => {
                      if (
                        await dialogs.confirm({
                          title: "Remove member",
                          message: `Remove ${p.displayName} (@${p.username}) from "${node.name}"?`,
                          confirmLabel: "Remove",
                          danger: true,
                        })
                      )
                        act(() => roles.removePerson(node.id, p.profileId));
                    }}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ── Section: Courses ────────────────────────────────────────────────────── */

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
  const dialogs = useDialogs();
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
    <div className="drawer-section">
      <button
        className={showNew ? "btn btn-quiet btn-small" : "btn btn-primary btn-small"}
        onClick={() => setShowNew((v) => !v)}
      >
        {showNew ? "Close form" : "+ New course on this role"}
      </button>

      {showNew && (
        <form
          className="add-person-form"
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
                description: String(d.get("description")),
                inLibrary: d.get("inLibrary") === "on",
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
            <span>Short description</span>
            <textarea
              name="description"
              required
              minLength={8}
              maxLength={500}
              rows={2}
              placeholder="What is this course for? Shown in the library and detail views."
            />
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
            <input type="checkbox" name="inLibrary" defaultChecked />
            <span>Publish to the organization library</span>
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
      <ul className="people-list">
        {list?.map((c) => (
          <li key={c.code} className="course-card">
            <div className="course-card-head">
              <span className="person-name">{c.title}</span>
              <span className="chip">{c.code}</span>
              <span className="badge">{c.kind.toLowerCase()}</span>
              {c.inLibrary && <span className="badge badge-ok">in library</span>}
            </div>
            {c.description && <p className="person-sub">{c.description}</p>}
            <div className="person-actions">
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
                  onClick={async () => {
                    if (
                      await dialogs.confirm({
                        title: "Delete course everywhere",
                        message: `Delete "${c.title}" (${c.code}) everywhere? All placements disappear. Completion history is kept.`,
                        confirmLabel: "Delete",
                        danger: true,
                      })
                    )
                      run(() => courses.remove(c.code));
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Section: Backup ─────────────────────────────────────────────────────── */

function BackupPanel({
  node,
  act,
}: {
  node: TreeNode;
  act: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const dialogs = useDialogs();
  return (
    <div className="drawer-section">
      <p className="auth-sub">
        A <code>.bkp</code> file is an encrypted backup of this branch — roles, people and
        course placements — restorable right here.
      </p>
      <div className="drawer-actions" style={{ marginTop: "0.6rem" }}>
        <button
          className="btn btn-quiet btn-small"
          onClick={async () => {
            const pw = await dialogs.promptPassword({
              title: "Backup password",
              message:
                "Choose a password for this .bkp — you will need it again to restore the backup.",
              label: "New backup password",
              confirmEntry: true,
              minLength: 8,
              submitLabel: "Export .bkp",
            });
            if (!pw) return;
            act(async () => {
              try {
                const blob = await vaultFiles.exportBkp(node.id, pw);
                downloadBlob(blob, `${node.name}.bkp`);
              } catch (e) {
                dialogs.toast(
                  e instanceof Error ? e.message : "Backup export failed",
                  "danger",
                );
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
            await dialogs.alert({
              title: "Restore report",
              message: (
                <>
                  <strong>Applied</strong>
                  <br />
                  {res.report.applied.length > 0 ? res.report.applied.join(", ") : "(nothing)"}
                  <br />
                  <strong>Skipped</strong>
                  <br />
                  {res.report.skipped.length > 0 ? res.report.skipped.join(", ") : "(nothing)"}
                </>
              ),
            });
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

/* ── The drawer: section chooser first, then the chosen section ──────────── */

const SECTIONS: {
  key: Section;
  label: string;
  desc: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "config",
    label: "Group configuration",
    desc: "Visibility, sub-groups, deletion — and the Supreme zone on the root",
    icon: <IconSettings />,
  },
  {
    key: "people",
    label: "People",
    desc: "Owners and members of this branch",
    icon: <IconUsers />,
  },
  {
    key: "courses",
    label: "Courses",
    desc: "Publish and configure knowledge for this branch",
    icon: <IconBook />,
  },
  {
    key: "backup",
    label: "Backup",
    desc: "Export or restore this branch as an encrypted .bkp",
    icon: <IconArchive />,
  },
];

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
  const [section, setSection] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSection(null);
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

  const available = SECTIONS.filter((s) =>
    s.key === "config" ? true : node.my.canAddPeople,
  );
  const current = SECTIONS.find((s) => s.key === section);

  return (
    <aside className="node-drawer glass" aria-label={`Role ${node.name}`}>
      <div className="drawer-head">
        <div>
          {section ? (
            <button className="drawer-back" onClick={() => setSection(null)}>
              ← {node.name}
            </button>
          ) : (
            <h2>{node.name}</h2>
          )}
          <p className="auth-sub">
            {current ? current.label : `role #${node.roleNumber}`}
          </p>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      {!section && (
        <>
          <div className="drawer-badges">
            {node.isPublic && <span className="badge badge-ok">public</span>}
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

          <p className="auth-sub">What do you want to do here?</p>
          <div className="drawer-menu">
            {available.map((s) => (
              <button key={s.key} className="drawer-menu-item" onClick={() => setSection(s.key)}>
                <span className="drawer-menu-icon">{s.icon}</span>
                <span>
                  <span className="drawer-menu-label">{s.label}</span>
                  <span className="drawer-menu-desc">{s.desc}</span>
                </span>
                <span className="drawer-menu-arrow" aria-hidden>
                  ›
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {section === "config" && <ConfigPanel node={node} act={act} onClose={onClose} />}
      {section === "people" && <PeoplePanel node={node} act={act} />}
      {section === "courses" && (
        <CoursesPanel node={node} orgId={orgId} act={act} onError={setError} />
      )}
      {section === "backup" && <BackupPanel node={node} act={act} />}

      {error && <p className="form-error">{error}</p>}
    </aside>
  );
}

/* ── Info drawer for nodes the user doesn't govern ───────────────────────── */

function InfoDrawer({
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
  const dialogs = useDialogs();
  const isMine = node.my.kinds.length > 0;

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
        {node.isPublic && <span className="badge badge-ok">public</span>}
        {node.my.kinds.map((k) => (
          <span key={k} className="badge badge-ok">
            you: {k.toLowerCase()}
          </span>
        ))}
        <span className="badge">
          {node.ownerCount + node.memberCount} people
        </span>
      </div>

      {isMine ? (
        <>
          <p className="auth-sub">
            This is one of your positions — your assigned knowledge lives in My Learning.
          </p>
          <Link className="btn btn-primary btn-small" href={`/orgs/${orgId}/learning`}>
            Open My Learning
          </Link>
        </>
      ) : node.my.canRequestJoin ? (
        <form
          className="drawer-section"
          onSubmit={async (e) => {
            e.preventDefault();
            const message = String(new FormData(e.currentTarget).get("message") || "");
            try {
              await requests.create(orgId, {
                kind: "JOIN_BRANCH",
                targetRoleNodeId: node.id,
                message: message || undefined,
              });
              dialogs.toast("Join request sent to the branch owners.", "success");
              onChanged();
              onClose();
            } catch (err) {
              dialogs.toast(
                err instanceof ApiError ? err.message : "Could not send the request",
                "danger",
              );
            }
          }}
        >
          <p className="auth-sub">
            This branch is public — you can ask its owners to add you as a member.
          </p>
          <label className="field">
            <span>Message (optional)</span>
            <textarea name="message" rows={2} maxLength={500} placeholder="Why you belong here…" />
          </label>
          <button className="btn btn-primary btn-small">Request to join</button>
        </form>
      ) : (
        <p className="auth-sub">
          You don&apos;t have access to this position — only its owners and the levels above
          can act here.
        </p>
      )}
    </aside>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function OrgConstellationPage() {
  const { org } = useOrg();
  const dialogs = useDialogs();
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

  // No redirects: nodes without access say so; joinable/own nodes open the info panel
  const onSelect = useCallback(
    (n: TreeNode | null) => {
      if (!n) {
        setSelectedId(null);
        return;
      }
      if (!governs(n) && n.my.kinds.length === 0 && !n.my.canRequestJoin) {
        setSelectedId(null);
        dialogs.toast("You don't have access to this position.", "danger");
        return;
      }
      setSelectedId(n.id);
    },
    [dialogs],
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
          {selected &&
            (governs(selected) ? (
              <NodeDrawer
                node={selected}
                orgId={org.id}
                onClose={() => setSelectedId(null)}
                onChanged={reload}
              />
            ) : (
              <InfoDrawer
                node={selected}
                orgId={org.id}
                onClose={() => setSelectedId(null)}
                onChanged={reload}
              />
            ))}
        </>
      )}
    </div>
  );
}
