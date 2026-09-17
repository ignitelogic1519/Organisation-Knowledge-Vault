"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  versionLabel,
  type OrgPlanLimitsView,
  type RolePerson,
  type StorageView,
  type TreeNode,
} from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { orgs, requests, roles } from "@/lib/orgs-client";
import { courses, downloadBlob, fileToBase64, vaultFiles } from "@/lib/courses-client";
import { studio } from "@/lib/studio-client";
import { storageApi } from "@/lib/storage-client";
import { classLabel, kindLabel, UNSHELVED } from "@/lib/course-labels";
import { openInWindow } from "@/lib/reader-window";
import { ActionMenu, type ActionGroup, type ActionOption } from "@/components/ActionMenu";
import {
  CatalogueBar,
  CatalogueEmpty,
  CatalogueRow,
  CatalogueSection,
  groupItems,
  kindGlyph,
} from "@/components/Catalogue";
import { StoragePanel } from "@/components/StoragePanel";
import { PropertiesEditor } from "@/components/studio/PropertiesEditor";
import { ReplaceFileSheet } from "@/components/studio/ReplaceFileSheet";
import { UploadComposer } from "@/components/studio/UploadComposer";
import { useSupremeGate } from "@/components/supreme-gate";
import { GraphLegend, OrgGraph } from "@/components/OrgGraph";
import { useOrg } from "@/components/org-context";
import { useOrgEvent } from "@/components/org-events";
import { useDialogs } from "@/components/dialogs";
import { UsernameField } from "@/components/UsernameField";
import { OrgLogoField } from "@/components/OrgLogoField";
import {
  IconArchive,
  IconBook,
  IconBranchDown,
  IconEye,
  IconFlag,
  IconKey,
  IconMinusUser,
  IconPause,
  IconPencil,
  IconPlay,
  IconSettings,
  IconSliders,
  IconTrash,
  IconUnlink,
  IconUpload,
  IconUser,
  IconUsers,
} from "@/components/icons";

// The org's MAIN page: the constellation. Your chain of roles is highlighted (see legend).
// Clicking a star you govern opens the action panel — first a section chooser
// (Group configuration / People / Courses / Backup), then the chosen section.
// Clicking a node you have no access to says so instead of navigating anywhere.

type RoleCourses = Awaited<ReturnType<typeof courses.listForRole>>["courses"];
type RoleCourse = RoleCourses[number];
type Section = "config" | "people" | "courses" | "backup";

/** How the courses on a branch are cut into sections — the reader chooses. */
type CourseGrouping = "shelf" | "type" | "status";

const STATUS_SECTIONS = ["Mandatory", "Opt-in", "Out of deployment", "Archived"];

const statusOf = (c: RoleCourse): string =>
  c.archived
    ? "Archived"
    : c.withdrawn
      ? "Out of deployment"
      : c.mandatory
        ? "Mandatory"
        : "Opt-in";

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
  act: (fn: () => Promise<unknown>) => Promise<boolean>;
  onClose: () => void;
}) {
  const { org, reload, isSupremeOwner } = useOrg();
  const dialogs = useDialogs();
  const router = useRouter();
  const [subRoleOpen, setSubRoleOpen] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const isRoot = node.parentId === null;
  // One shared gate: it keeps the sheet open and names the reason when a password is
  // rejected, instead of closing silently behind a four-second toast.
  const supreme = useSupremeGate(org.id);
  const supremeToken = supreme.token;
  const supremePassword = supreme.password;
  const unlockSupreme = supreme.unlock;

  return (
    <div className="drawer-section">
      {/* visibility — public by default; hiding is the explicit checkbox choice and
          inherits down from every level above. Owners above always keep seeing it.
          The main branch carries no switch at all: it is where every member arrives. */}
      <div className="config-row">
        <div>
          <strong>Visibility</strong>
          {isRoot ? (
            <p className="auth-sub">
              This is the organization&apos;s main branch — where every member arrives — so
              it is always visible and cannot be hidden. Hiding is a sub-branch property:
              create a sub-role and hide that one instead.
            </p>
          ) : (
            <>
              <p className="auth-sub">
                Branches are public by default — every member sees them and can send a Join
                request. Hiding removes the branch from people on the same layer and below;
                it hides everything beneath it too, down to the last end. Owners above this
                node always keep seeing it.
              </p>
              {node.my.canSetVisibility && (
                <label className="ack-row" style={{ marginTop: "0.45rem" }}>
                  <input
                    type="checkbox"
                    checked={!node.isPublic}
                    onChange={() => act(() => roles.setPublic(node.id, !node.isPublic))}
                  />
                  <span>Hidden (private) branch</span>
                </label>
              )}
            </>
          )}
        </div>
      </div>
      {node.isPublic && !node.effectivePublic && (
        <div className="config-row config-row-warn">
          <div>
            <strong>Hidden by a level above</strong>
            <p className="auth-sub">
              This branch is marked public, but a hidden level above keeps it — and its
              whole subtree — invisible.
              {node.my.canRequestVisibility
                ? " Ask that level's owners to unhide the chain."
                : " Unhide the level above to make it show."}
            </p>
          </div>
          {node.my.canRequestVisibility && (
            <button
              className="btn btn-quiet btn-small"
              onClick={async () => {
                if (
                  await dialogs.confirm({
                    title: "Visibility request",
                    message: `Ask the level above to unhide the chain so "${node.name}" becomes publicly visible?`,
                    confirmLabel: "Send request",
                  })
                ) {
                  await act(async () => {
                    await requests.create(org.id, {
                      kind: "VISIBILITY",
                      targetRoleNodeId: node.id,
                    });
                    dialogs.toast("Visibility request sent to the level above.", "success");
                  });
                }
              }}
            >
              Request visibility
            </button>
          )}
        </div>
      )}

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
            act(() =>
              roles.createSubRole(node.id, String(d.get("name")), d.get("hidden") !== "on"),
            );
            setSubRoleOpen(false);
          }}
        >
          <label className="field">
            <span>New sub-role name</span>
            <input name="name" required minLength={2} autoFocus />
          </label>
          <label className="ack-row">
            <input type="checkbox" name="hidden" />
            <span>Hidden (private)</span>
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

      {/* The organization's identity — root node only, and its owners.
          Not Supreme-gated: the Supreme password guards the irreversible (who owns this,
          where the documents live, deleting it). A logo is reversible by uploading the
          previous one, and asking for the unrecoverable password to change a picture
          teaches people to type it without thinking. */}
      {isRoot && isSupremeOwner && (
        <div className="config-row config-row-logo">
          <div>
            <strong>Organization logo</strong>
            <p className="auth-sub">
              Shown on the organization card, at the top of every page here, and on the
              cover of every document this organization publishes. Without one, the
              first letter of the name is used.
            </p>
            <OrgLogoField
              name={org.name}
              value={org.logo}
              busy={logoBusy}
              label={null}
              hint={null}
              onChange={async (next) => {
                setLogoBusy(true);
                try {
                  await orgs.setLogo(org.id, next);
                  reload();
                  dialogs.toast(next ? "Logo updated." : "Logo removed.", "success");
                } catch (e) {
                  dialogs.toast(
                    e instanceof ApiError ? e.message : "Could not save the logo",
                    "danger",
                  );
                } finally {
                  setLogoBusy(false);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Supreme zone — root node only, replaces the old Admin console */}
      {isRoot && isSupremeOwner && (
        <>
          {/* Where the organization's documents live. Governance, so it sits behind the
              same Supreme gate as owner management (docs/structure.md §9.3).
              A KVEP organization has no storage to connect by design — its content stays
              on Knowledge Vault's own storage — so it gets a statement of fact instead of
              a form that would refuse everything entered into it. */}
          {org.isKvep ? (
            <section className="panel storage-panel">
              <h3>Storage</h3>
              <p className="muted">
                This is an employee-perk (KVEP) organization, so its documents are held on
                Knowledge Vault&rsquo;s own storage and the plan&rsquo;s allowance applies.
                There is nothing to connect or configure here.
              </p>
            </section>
          ) : (
            <StoragePanel
              orgId={org.id}
              supremeToken={supremeToken}
              onNeedSupreme={() =>
                unlockSupreme(
                  "Connecting storage decides where this organization's documents live, so it needs the Supreme password.",
                )
              }
            />
          )}

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
            <UsernameField
              orgId={org.id}
              label="Add supreme co-owner by username"
              required
            />
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
  orgId,
  act,
}: {
  node: TreeNode;
  orgId: string;
  act: (fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const dialogs = useDialogs();
  // Button-inside-button flow: "+ Add person" → choose member OR co-owner → the
  // tailored form. Owner-only options never appear on the member form.
  const [addStep, setAddStep] = useState<"closed" | "choose" | "MEMBER" | "OWNER">("closed");
  /** The person whose action menu is open — their name is what opens it. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const people = node.people ?? [];
  const searching = query.trim().length > 0;
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) =>
      `${p.displayName} ${p.username}`.toLowerCase().includes(q),
    );
  }, [people, query]);
  const owners = matches.filter((p) => p.kind === "OWNER");
  const members = matches.filter((p) => p.kind === "MEMBER");
  const openPerson = people.find((p) => p.profileId === openId) ?? null;

  /** A failure keeps the menu open beside the reason it gives. */
  const runInMenu = async (fn: () => Promise<unknown>) => {
    if (!(await act(fn))) throw new Error("action failed");
  };

  const personActions = (p: RolePerson): ActionGroup[] => {
    const isOwner = p.kind === "OWNER";
    const rights: ActionOption[] = [];
    if (isOwner && node.my.canManageFlags) {
      rights.push(
        {
          key: "subgroups",
          label: p.canCreateSubgroups ? "May create sub-groups" : "Cannot create sub-groups",
          glyph: <IconBranchDown size={16} />,
          on: p.canCreateSubgroups,
          keepOpen: true,
          desc: p.canCreateSubgroups
            ? "They can grow this branch downward with new sub-roles. Choose it to withdraw that right."
            : "They manage this branch but cannot grow it. Choose it to let them create sub-roles.",
          run: () =>
            runInMenu(() =>
              roles.setPersonFlags(node.id, p.profileId, {
                canCreateSubgroups: !p.canCreateSubgroups,
              }),
            ),
        },
        {
          key: "coowners",
          label: p.canAddCoOwners ? "May appoint co-owners" : "Cannot appoint co-owners",
          glyph: <IconKey size={16} />,
          on: p.canAddCoOwners,
          keepOpen: true,
          desc: p.canAddCoOwners
            ? "They can bring further owners onto this branch. Choose it to withdraw that right."
            : "Only you and the levels above can appoint owners here. Choose it to let them do it too.",
          run: () =>
            runInMenu(() =>
              roles.setPersonFlags(node.id, p.profileId, { canAddCoOwners: !p.canAddCoOwners }),
            ),
        },
      );
    }
    if (!isOwner) {
      rights.push({
        key: "content",
        label: p.canCreateContent ? "May create content" : "Cannot create content",
        glyph: <IconPencil size={16} />,
        on: p.canCreateContent,
        keepOpen: true,
        desc: p.canCreateContent
          ? "They can propose documents for this branch; each one publishes after your review. Choose it to withdraw that right."
          : "They only learn from this branch. Choose it to let them propose documents, which publish after your review.",
        run: () =>
          runInMenu(() =>
            roles.setPersonFlags(node.id, p.profileId, {
              canCreateContent: !p.canCreateContent,
            }),
          ),
      });
    }

    return [
      { title: "Rights on this branch", options: rights },
      {
        title: "Placement",
        options: [
          {
            key: "remove",
            label: "Remove from this branch",
            glyph: <IconMinusUser size={16} />,
            tone: "danger",
            desc: `They lose ${isOwner ? "their ownership of" : "the courses that reach them through"} ${node.name}. Their profile and every other position they hold are untouched.`,
            run: async () => {
              const ok = await dialogs.confirm({
                title: isOwner ? "Remove owner" : "Remove member",
                message: `Remove ${p.displayName} (@${p.username}) from "${node.name}"?`,
                confirmLabel: "Remove",
                danger: true,
              });
              if (!ok) throw new Error("cancelled");
              await runInMenu(() => roles.removePerson(node.id, p.profileId));
            },
          },
        ],
      },
    ];
  };

  return (
    <div className="drawer-section">
      <button
        className={addStep === "closed" ? "btn btn-primary btn-small" : "btn btn-quiet btn-small"}
        onClick={() => setAddStep(addStep === "closed" ? "choose" : "closed")}
      >
        {addStep === "closed" ? "+ Add person" : "Cancel"}
      </button>

      {addStep === "choose" && (
        <div className="drawer-menu">
          <button className="drawer-menu-item" onClick={() => setAddStep("MEMBER")}>
            <span className="drawer-menu-icon">
              <IconUser />
            </span>
            <span>
              <span className="drawer-menu-label">Add a member</span>
              <span className="drawer-menu-desc">They learn from this branch</span>
            </span>
            <span className="drawer-menu-arrow" aria-hidden>
              ›
            </span>
          </button>
          {node.my.canAddCoOwners && (
            <button className="drawer-menu-item" onClick={() => setAddStep("OWNER")}>
              <span className="drawer-menu-icon">
                <IconUsers />
              </span>
              <span>
                <span className="drawer-menu-label">Add a co-owner</span>
                <span className="drawer-menu-desc">They help manage this branch</span>
              </span>
              <span className="drawer-menu-arrow" aria-hidden>
                ›
              </span>
            </button>
          )}
        </div>
      )}

      {(addStep === "MEMBER" || addStep === "OWNER") && (
        <form
          className="add-person-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const username = String(d.get("username")).toLowerCase();
            // The form stays open on failure (e.g. "user doesn't exist") — never a
            // silent close
            const ok = await act(() =>
              roles.addPerson(node.id, {
                username,
                kind: addStep,
                canCreateSubgroups: addStep === "OWNER" && d.get("delegate") === "on",
                canAddCoOwners: addStep === "OWNER" && d.get("coowners") === "on",
                canCreateContent: addStep === "MEMBER" && d.get("createContent") === "on",
              }),
            );
            if (ok) {
              dialogs.toast(
                `Added @${username} to ${node.name} as ${addStep === "OWNER" ? "co-owner" : "member"}.`,
                "success",
              );
              setAddStep("closed");
            }
          }}
        >
          <div className="add-person-head">
            <button
              type="button"
              className="drawer-back"
              onClick={() => setAddStep("choose")}
            >
              ←
            </button>
            <strong>{addStep === "OWNER" ? "New co-owner" : "New member"}</strong>
          </div>
          <UsernameField
            orgId={orgId}
            required
            autoFocus
            hint="Start typing to see who exists — unknown usernames are reserved and attach when they register"
          />
          {addStep === "MEMBER" && (
            <label className="ack-row">
              <input type="checkbox" name="createContent" />
              <span>May create content (documents publish after your review)</span>
            </label>
          )}
          {addStep === "OWNER" && (
            <>
              <p className="auth-sub" style={{ fontSize: "0.8rem" }}>
                Rights of the new co-owner — you can only grant what you hold yourself:
              </p>
              {node.my.canGrantSubgroups && (
                <label className="ack-row">
                  <input type="checkbox" name="delegate" />
                  <span>May create sub-groups</span>
                </label>
              )}
              <label className="ack-row">
                <input type="checkbox" name="coowners" />
                <span>May appoint further co-owners</span>
              </label>
            </>
          )}
          <button className="btn btn-primary btn-small">
            Add {addStep === "OWNER" ? "co-owner" : "member"} to {node.name}
          </button>
        </form>
      )}

      {people.length === 0 && (
        <p className="auth-sub">Nobody placed here yet — add the first person above.</p>
      )}

      {/* A handful of people is a list you read; a department is one you search. */}
      {people.length > 5 && (
        <CatalogueBar
          value={query}
          onChange={setQuery}
          label="Search the people on this branch"
          placeholder="Search name or @username…"
          shown={matches.length}
          total={people.length}
          noun="person"
        />
      )}

      {people.length > 0 && matches.length === 0 && (
        <CatalogueEmpty>Nobody on this branch matches that search.</CatalogueEmpty>
      )}

      {owners.length > 0 && (
        <CatalogueSection title="Owners" count={owners.length} forceOpen={searching}>
          {owners.map((p) => (
            <CatalogueRow
              key={p.profileId}
              leading={
                <span className="avatar avatar-owner">{initialsOf(p.displayName)}</span>
              }
              title={p.displayName}
              meta={`@${p.username}`}
              chips={
                <>
                  {p.canCreateSubgroups && <span className="badge badge-ok">sub-groups</span>}
                  {p.canAddCoOwners && <span className="badge badge-ok">appoints co-owners</span>}
                </>
              }
              hint="What this owner may do here, and the door out of the branch."
              hintTitle={p.displayName}
              onOpen={() => setOpenId(p.profileId)}
            />
          ))}
        </CatalogueSection>
      )}

      {members.length > 0 && (
        <CatalogueSection title="Members" count={members.length} forceOpen={searching}>
          {members.map((p) => (
            <CatalogueRow
              key={p.profileId}
              leading={<span className="avatar">{initialsOf(p.displayName)}</span>}
              title={p.displayName}
              meta={`@${p.username}`}
              chips={
                p.canCreateContent ? <span className="badge badge-ok">creates content</span> : null
              }
              hint="What this member may do here, and the door out of the branch."
              hintTitle={p.displayName}
              onOpen={() => setOpenId(p.profileId)}
            />
          ))}
        </CatalogueSection>
      )}

      {openPerson && (
        <ActionMenu
          title={openPerson.displayName}
          subtitle={
            <>
              @{openPerson.username} · {openPerson.kind === "OWNER" ? "owner" : "member"} of{" "}
              {node.name}
            </>
          }
          groups={personActions(openPerson)}
          onClose={() => setOpenId(null)}
        />
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
  act: (fn: () => Promise<unknown>) => Promise<boolean>;
  onError: (m: string) => void;
}) {
  const dialogs = useDialogs();
  const router = useRouter();
  const [list, setList] = useState<RoleCourses | null>(null);
  const [showNew, setShowNew] = useState(false);
  // The organization's own storage, when it has connected one (docs/structure.md §9).
  // Uploads go straight to it; without it they fall back to the inline adapter.
  const [orgStorage, setOrgStorage] = useState<StorageView | null>(null);
  useEffect(() => {
    storageApi
      .get(orgId)
      .then(setOrgStorage)
      .catch(() => setOrgStorage(null));
  }, [orgId]);
  const [limits, setLimits] = useState<OrgPlanLimitsView | null>(null);
  const [catInfo, setCatInfo] = useState<{ suggestion: string | null; categories: string[] }>({
    suggestion: null,
    categories: [],
  });
  /** Course whose properties are open for editing — the "I got something wrong" door. */
  const [editingProps, setEditingProps] = useState<string | null>(null);
  /** Uploaded course whose file is being swapped for a new edition. */
  const [replacing, setReplacing] = useState<string | null>(null);
  /** The course whose action menu is open. A row's title is what opens it. */
  const [openCode, setOpenCode] = useState<string | null>(null);
  // Finding one document among a hundred: search first, then sections, then the row.
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<CourseGrouping>("shelf");
  const [kindFilter, setKindFilter] = useState("all");

  const load = useCallback(() => {
    const listed = courses
      .listForRole(node.id)
      .then((r) => setList(r.courses))
      .catch((e) => onError(e instanceof ApiError ? e.message : "Could not load courses"));
    studio
      .limits(orgId)
      .then(setLimits)
      .catch(() => undefined);
    // The shelves that already exist — offered as suggestions wherever a shelf is asked for.
    courses
      .suggestCategory(orgId, "", "")
      .then(setCatInfo)
      .catch(() => undefined);
    // Awaited by the action menu, so an option that stays open re-reads the course it
    // just changed instead of showing the state it had a moment ago.
    return listed;
  }, [node.id, orgId, onError]);
  useEffect(() => {
    void load();
  }, [load]);

  const uploadsLeft = limits?.uploads.remaining;
  const uploadsFull = uploadsLeft === 0;
  const documentsFull = limits?.documents.remaining === 0;

  /** Formal notice when an allowance is spent — the admin is the one who can lift it. */
  const allowanceNotice = (what: string, limit: number | null) =>
    dialogs.alert({
      title: "Plan allowance reached",
      tone: "info",
      message: (
        <>
          <p>
            This organization has used all <strong>{limit} {what}</strong> included in its
            current plan.
          </p>
          <p>
            Please contact your main administrator so they can arrange a premium plan with the
            Knowledge Base team, or free up capacity by deleting material that is no longer
            required.
          </p>
        </>
      ),
    });

  const run = async (fn: () => Promise<unknown>) => {
    await act(fn);
    void load();
  };

  /**
   * The same thing from inside the action menu, with one difference: a failure is
   * re-thrown so the menu stays open beside the error it caused, rather than vanishing
   * behind a four-second toast.
   */
  const runInMenu = async (fn: () => Promise<unknown>) => {
    const ok = await act(fn);
    await load();
    if (!ok) throw new Error("action failed");
  };

  /** Read it as a reader meets it — full screen, and nothing recorded against anybody. */
  const preview = (code: string) => {
    if (!openInWindow(orgId, code, true)) {
      dialogs.toast(
        "Your browser blocked the reader window. Allow pop-ups for Knowledge Vault and try again.",
        "danger",
      );
    }
  };

  const kindsPresent = useMemo(
    () => [...new Set((list ?? []).map((c) => c.kind))].sort(),
    [list],
  );

  const searching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? [])
      .filter(
        (c) =>
          (kindFilter === "all" || c.kind === kindFilter) &&
          (q === "" ||
            [c.title, c.code, c.description ?? "", c.category ?? "", kindLabel(c.kind)]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [list, query, kindFilter]);

  const sections = useMemo(
    () =>
      groupItems(
        filtered,
        (c) =>
          grouping === "type"
            ? kindLabel(c.kind)
            : grouping === "status"
              ? statusOf(c)
              : (c.category ?? UNSHELVED),
        grouping === "status" ? { order: STATUS_SECTIONS } : { last: UNSHELVED },
      ),
    [filtered, grouping],
  );

  const openCourse = list?.find((c) => c.code === openCode) ?? null;

  /**
   * What can be done with one course, grouped by what the choice actually touches: the
   * branch you are standing on, or the document everywhere it exists. That distinction
   * used to live in a paragraph of small print above the list and in hover hints on
   * eight identical buttons; here it is the shape of the menu itself.
   */
  const courseActions = (c: RoleCourse): ActionGroup[] => {
    const placement = (patch: { mandatory?: boolean; inheritToDescendants?: boolean }) =>
      courses.place(c.code, {
        roleNodeId: node.id,
        mandatory: patch.mandatory ?? c.mandatory,
        inheritToDescendants: patch.inheritToDescendants ?? c.inheritToDescendants,
      });

    const manage: ActionOption[] = c.canManage
      ? [
          {
            key: "properties",
            label: "Edit properties",
            glyph: <IconSliders size={16} />,
            desc: "Classification, description, shelf, deadline, recurrence, prerequisites, downloads. The content is untouched, so nothing here bumps the version or expires anybody's completion.",
            run: () => {
              setEditingProps(c.code);
            },
          },
          {
            key: "deployment",
            label: c.withdrawn ? "Put back into deployment" : "Take out of deployment",
            glyph: c.withdrawn ? <IconPlay size={16} /> : <IconPause size={16} />,
            on: c.withdrawn,
            desc: c.withdrawn
              ? "Puts it back on exactly the branches it already had. Readers get the current edition again."
              : "A pause. It reaches nobody and leaves the library, but every placement is kept — this is the step before a new edition, so no one is left half-way through an edition being rewritten.",
            run: () => runInMenu(() => courses.withdraw(c.code, !c.withdrawn)),
          },
          {
            key: "revise",
            label: c.source === "STUDIO" ? "Revise in the Studio" : "Replace the file",
            glyph: c.source === "STUDIO" ? <IconPencil size={16} /> : <IconUpload size={16} />,
            desc:
              c.source === "STUDIO"
                ? `Opens ${versionLabel(c.version)} in the Studio and publishes ${versionLabel(c.version + 1)}. Everyone keeps receiving it on the same branches.`
                : `Swaps the file or address behind this document and publishes ${versionLabel(c.version + 1)}. Its title, classification and placements are all kept.`,
            run: () => {
              if (c.source === "STUDIO") {
                router.push(
                  `/orgs/${orgId}/studio?role=${node.id}&type=${c.kind === "EXAM" ? "exam" : "document"}&course=${c.code}`,
                );
              } else {
                setReplacing(c.code);
              }
            },
          },
          {
            key: "archive",
            label: c.archived ? "Bring it out of the archive" : "Archive it everywhere",
            glyph: <IconArchive size={16} />,
            tone: c.archived ? "default" : "danger",
            desc: c.archived
              ? "Back into use: it can be assigned to branches again."
              : "Retires the document org-wide, not just here. It keeps its history and stays readable to the people who already have it, but it can never be assigned to a new branch again.",
            run: () => runInMenu(() => courses.archive(c.code, !c.archived)),
          },
        ]
      : [];

    return [
      {
        title: "Read it",
        options: [
          {
            key: "preview",
            label: "Preview the document",
            glyph: <IconEye size={16} />,
            tone: "primary",
            desc: "Opens it full screen exactly as a reader meets it. Nothing is recorded against your own learning.",
            run: () => preview(c.code),
          },
        ],
      },
      {
        title: `On ${node.name}`,
        note: "Settings that belong to this branch alone — every other branch keeps what it has.",
        options: [
          {
            key: "mandatory",
            label: c.mandatory ? "Mandatory here" : "Opt-in here",
            glyph: <IconFlag size={16} />,
            on: c.mandatory,
            keepOpen: true,
            desc: c.mandatory
              ? "It is on the compliance list of everyone this branch reaches, and they are chased if they do not finish it. Choose it to make it opt-in."
              : "It is offered, but nobody is required to finish it and it never counts as non-compliant. Choose it to make it mandatory.",
            run: () => runInMenu(() => placement({ mandatory: !c.mandatory })),
          },
          {
            key: "inherit",
            label: c.inheritToDescendants ? "Passed down the subtree" : "This branch only",
            glyph: <IconBranchDown size={16} />,
            on: c.inheritToDescendants,
            keepOpen: true,
            desc: c.inheritToDescendants
              ? "Every branch beneath this one receives it too. Choose it to limit the document to this branch alone."
              : "Only this branch receives it — sub-branches do not. Choose it to pass it down the whole subtree.",
            run: () =>
              runInMenu(() => placement({ inheritToDescendants: !c.inheritToDescendants })),
          },
          {
            key: "unplace",
            label: "Unplace from this branch",
            glyph: <IconUnlink size={16} />,
            tone: "danger",
            desc: "Takes it off THIS branch only. The document keeps existing, stays in the library and keeps reaching every other branch it is placed on.",
            run: () => runInMenu(() => courses.unplace(c.code, node.id)),
          },
        ],
      },
      {
        title: "The document itself",
        note: "These reach every branch the document is on, not only this one.",
        options: manage,
      },
      {
        title: "Permanent",
        options: c.canDelete
          ? [
              {
                key: "delete",
                label: "Delete it everywhere",
                glyph: <IconTrash size={16} />,
                tone: "danger",
                desc: "Deletes the document and every placement of it, everywhere. Completion history survives. There is no undo.",
                run: async () => {
                  const ok = await dialogs.confirm({
                    title: "Delete course everywhere",
                    message: `Delete "${c.title}" (${c.code}) everywhere? All placements disappear. Completion history is kept.`,
                    confirmLabel: "Delete",
                    danger: true,
                  });
                  if (!ok) throw new Error("cancelled");
                  await runInMenu(() => courses.remove(c.code));
                },
              },
            ]
          : [],
      },
    ];
  };

  return (
    <div className="drawer-section">
      <div className="drawer-actions">
        <button
          className={showNew ? "btn btn-quiet btn-small" : "btn btn-primary btn-small"}
          onClick={() => {
            if (!showNew && uploadsFull) {
              void allowanceNotice("uploaded documents", limits?.uploads.limit ?? null);
              return;
            }
            setShowNew((v) => !v);
          }}
        >
          {showNew ? "Close form" : "+ Upload course"}
        </button>
        <button
          className="btn btn-quiet btn-small"
          title="Create an interactive document or an MCQ exam from scratch"
          onClick={() => {
            if (documentsFull) {
              void allowanceNotice("custom documents", limits?.documents.limit ?? null);
              return;
            }
            // The Studio asks what is being created (document or exam) before it opens.
            router.push(`/orgs/${orgId}/studio?role=${node.id}`);
          }}
        >
          ✍ Create in Studio
        </button>
      </div>

      {showNew && (
        <UploadComposer
          orgId={orgId}
          roleNodeId={node.id}
          roleName={node.name}
          limits={limits}
          categories={catInfo.categories}
          orgStorage={orgStorage}
          needsReview={!node.my.canAddPeople}
          onDone={() => {
            setShowNew(false);
            load();
          }}
          onCancel={() => setShowNew(false)}
        />
      )}

      <h3 className="learning-h">Courses on this role</h3>
      {!list && <p className="auth-sub">Loading…</p>}
      {list?.length === 0 && <p className="auth-sub">No courses placed here yet.</p>}

      {list && list.length > 0 && (
        <>
          <CatalogueBar
            value={query}
            onChange={setQuery}
            label="Search the courses on this branch"
            placeholder="Search title, code, shelf…"
            shown={filtered.length}
            total={list.length}
            noun="course"
          >
            <label className="field cat-field">
              <span>Sections</span>
              <select
                value={grouping}
                onChange={(e) => setGrouping(e.target.value as CourseGrouping)}
              >
                <option value="shelf">By shelf</option>
                <option value="type">By type</option>
                <option value="status">By status</option>
              </select>
            </label>
            {kindsPresent.length > 1 && (
              <label className="field cat-field">
                <span>Type</span>
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
                  <option value="all">All types</option>
                  {kindsPresent.map((k) => (
                    <option key={k} value={k}>
                      {kindLabel(k)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </CatalogueBar>

          {filtered.length === 0 && (
            <CatalogueEmpty>
              Nothing placed on this branch matches what you are looking for.
            </CatalogueEmpty>
          )}

          {sections.map(([title, items], i) => (
            <CatalogueSection
              key={title}
              title={title}
              count={items.length}
              forceOpen={searching}
              // A shelf or two reads as one list and stays open. A filing cabinet of them
              // opens at the first drawer, and the reader picks the next.
              defaultOpen={filtered.length <= 12 || i === 0}
              tone={
                title === "Archived" ? "muted" : title === "Out of deployment" ? "warn" : "default"
              }
            >
              {items.map((c) => (
                <CatalogueRow
                  key={c.code}
                  leading={kindGlyph(c.kind)}
                  title={c.title}
                  meta={
                    <>
                      {c.code} · {kindLabel(c.kind)} · {versionLabel(c.version)}
                      {grouping !== "shelf" && c.category ? ` · ${c.category}` : ""}
                    </>
                  }
                  chips={
                    <>
                      <span className={`badge class-badge class-${c.classification}`}>
                        {classLabel(c.classification)}
                      </span>
                      <span className="badge">{c.mandatory ? "mandatory" : "opt-in"}</span>
                      {c.inheritToDescendants && <span className="badge">inherits ↓</span>}
                      {c.inLibrary && <span className="badge badge-ok">in library</span>}
                      {c.withdrawn && (
                        <span className="badge badge-danger">out of deployment</span>
                      )}
                      {c.archived && <span className="badge badge-danger">archived</span>}
                    </>
                  }
                  dim={c.archived || c.withdrawn}
                  hint="Everything this document can do — preview it, change how it reaches this branch, publish a new edition, retire it."
                  hintTitle={c.title}
                  onOpen={() => setOpenCode(c.code)}
                />
              ))}
            </CatalogueSection>
          ))}
        </>
      )}

      {openCourse && (
        <ActionMenu
          title={openCourse.title}
          subtitle={
            <>
              {kindLabel(openCourse.kind)} · {openCourse.code} ·{" "}
              {versionLabel(openCourse.version)} · on {node.name}
            </>
          }
          chips={
            <>
              <span className={`badge class-badge class-${openCourse.classification}`}>
                {classLabel(openCourse.classification)}
              </span>
              {openCourse.category && <span className="chip">{openCourse.category}</span>}
              {openCourse.inLibrary && <span className="badge badge-ok">in library</span>}
              {openCourse.withdrawn && (
                <span className="badge badge-danger">out of deployment</span>
              )}
              {openCourse.archived && <span className="badge badge-danger">archived</span>}
            </>
          }
          groups={courseActions(openCourse)}
          onClose={() => setOpenCode(null)}
        />
      )}

      {editingProps && (
        <PropertiesEditor
          code={editingProps}
          orgId={orgId}
          limits={limits}
          categories={catInfo.categories}
          onClose={() => setEditingProps(null)}
          onSaved={load}
        />
      )}

      {replacing && (
        <ReplaceFileSheet
          code={replacing}
          orgId={orgId}
          orgStorage={orgStorage}
          onClose={() => setReplacing(null)}
          onDone={() => {
            setReplacing(null);
            load();
          }}
        />
      )}

      {/* Where the plan stands. It sits at the FOOT of the panel — reference, not a
          banner — and only says anything when the plan actually meters something. An
          organization already on a paid plan is never told to go and buy one. */}
      {limits && (limits.uploads.limit != null || limits.documents.limit != null) && (
        <div className="plan-allowance" data-full={uploadsFull || documentsFull}>
          <div className="plan-allowance-meters">
            {limits.documents.limit != null && (
              <span className="plan-allowance-meter">
                Custom documents <strong>{limits.documents.used}</strong> / {limits.documents.limit}
              </span>
            )}
            {limits.uploads.limit != null && (
              <span className="plan-allowance-meter">
                Uploads <strong>{limits.uploads.used}</strong> / {limits.uploads.limit}
              </span>
            )}
            {limits.storageMb.limit != null && (
              <span className="plan-allowance-meter">
                Storage <strong>{limits.storageMb.used}</strong> / {limits.storageMb.limit} MB
              </span>
            )}
          </div>
          <p className="plan-allowance-note">
            {limits.planName ? `${limits.planName} plan.` : "No active plan."}{" "}
            {limits.isFreePlan
              ? "A paid plan lifts the document and upload counts entirely — ask your main administrator to arrange one."
              : "These are the ceilings set for this organization."}
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Section: Backup ─────────────────────────────────────────────────────── */

function BackupPanel({
  node,
  act,
}: {
  node: TreeNode;
  act: (fn: () => Promise<unknown>) => Promise<boolean>;
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
  const dialogs = useDialogs();
  const [section, setSection] = useState<Section | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSection(null);
    setError(null);
  }, [node.id]);

  // Runs an action; failures surface both inline AND as a bottom-center toast so a
  // form never just "closes silently". Returns whether the action succeeded.
  const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
    setError(null);
    try {
      await fn();
      onChanged();
      return true;
    } catch (e) {
      const message = e instanceof ApiError ? e.message : "Action failed";
      setError(message);
      dialogs.toast(message, "danger");
      return false;
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
            {!node.effectivePublic && (
              <span className="badge">
                {node.isPublic ? "hidden by a level above" : "hidden"}
              </span>
            )}
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
      {section === "people" && <PeoplePanel node={node} orgId={orgId} act={act} />}
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
        {!node.effectivePublic && <span className="badge">hidden</span>}
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
          <div className="drawer-actions">
            <Link className="btn btn-primary btn-small" href={`/orgs/${orgId}/learning`}>
              Open My Learning
            </Link>
            {node.my.canProposeContent && (
              <Link
                className="btn btn-quiet btn-small"
                href={`/orgs/${orgId}/studio?role=${node.id}`}
              >
                ✍ Propose a document
              </Link>
            )}
          </div>
          {node.my.canProposeContent && (
            <p className="auth-sub" style={{ fontSize: "0.8rem" }}>
              You can create documents for this branch — they publish after your manager
              reviews them.
            </p>
          )}
        </>
      ) : node.my.canRequestJoin ? (
        <form
          className="drawer-section"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            const joinAs = d.get("joinAs") === "OWNER" ? "OWNER" : "MEMBER";
            const message = String(d.get("message") || "");
            try {
              await requests.create(orgId, {
                kind: "JOIN_BRANCH",
                targetRoleNodeId: node.id,
                joinAs,
                message: message || undefined,
              });
              dialogs.toast(
                `Join request sent — asking to be a ${joinAs === "OWNER" ? "sub-owner" : "member"} of ${node.name}.`,
                "success",
              );
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
            This branch is public — ask its owners to add you, and choose the position you
            want.
          </p>
          <label className="field">
            <span>Join as</span>
            <select name="joinAs" defaultValue="MEMBER">
              <option value="MEMBER">Member — learn from this branch</option>
              <option value="OWNER">Sub-owner — help manage this branch</option>
            </select>
          </label>
          <label className="field">
            <span>Message (optional)</span>
            <textarea name="message" rows={2} maxLength={500} placeholder="Why you belong here…" />
          </label>
          <button className="btn btn-primary btn-small">Send join request</button>
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [nodes, setNodes] = useState<TreeNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // "Show where it's published" from the library deep-links here with ?focus=id,id,…
  // The constellation spotlights those nodes and dims the rest until the user clears
  // it (dismiss button) or leaves the page — going back / switching tabs resets it.
  const focusParam = searchParams.get("focus");
  const [dismissedFocus, setDismissedFocus] = useState(false);
  const highlightIds = useMemo(() => {
    if (!focusParam || dismissedFocus) return undefined;
    const set = new Set(focusParam.split(",").filter(Boolean));
    return set.size > 0 ? set : undefined;
  }, [focusParam, dismissedFocus]);
  const focusedNames = useMemo(() => {
    if (!highlightIds || !nodes) return [];
    return nodes.filter((n) => highlightIds.has(n.id)).map((n) => n.name);
  }, [highlightIds, nodes]);

  const reload = useCallback(() => {
    roles
      .structure(org.id)
      .then((v) => setNodes(v.nodes))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load structure"));
  }, [org.id]);

  useEffect(reload, [reload]);
  // Live: structure and course changes made by anyone reflect without a refresh
  useOrgEvent(["structure", "courses"], reload);

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
          <OrgGraph
            nodes={nodes}
            selectedId={selectedId}
            onSelect={onSelect}
            highlightIds={highlightIds}
          />
          {highlightIds ? (
            <div className="graph-spotlight glass">
              <span>
                Published on{" "}
                <strong>
                  {focusedNames.length > 0 ? focusedNames.join(", ") : "this branch"}
                </strong>
              </span>
              <button
                className="btn btn-quiet btn-small"
                onClick={() => {
                  setDismissedFocus(true);
                  router.replace(`/orgs/${org.id}`);
                }}
              >
                Reset view
              </button>
            </div>
          ) : (
            <span className="graph-hint glass">
              Drag to pan · scroll or pinch to zoom · click a star to act on it
            </span>
          )}
          {!selected && !highlightIds && <GraphLegend />}
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
