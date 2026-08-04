"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { fileToBase64, vaultFiles } from "@/lib/courses-client";
import { useDialogs } from "./dialogs";
import { IconRecovery } from "./icons";

// Recovery — a dock in the bottom-left corner of the organizations page, out of the way
// until you need it. Both ways back live behind the one button:
//
//   · organizations you deleted, waiting out their 30 days before purge; and
//   · reviving one from its `.main` file, for anything already purged.
//
// It is deliberately NOT a wastebasket. A deleted organization here is not refuse waiting
// to be emptied — it is intact and one password away from coming back — and the `.main`
// path recovers things the bin never held. "Recovery" is what the button actually does.

type DeletedOrg = Awaited<ReturnType<typeof orgs.listDeleted>>[number];

export function RecoveryDock({
  deleted,
  onChanged,
}: {
  deleted: DeletedOrg[];
  /** Reload the caller's lists after something comes back. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const dialogs = useDialogs();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"bin" | "main">("bin");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes the panel; a click outside does too.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  /** Take an organization back out of the bin: Supreme password, then — if its plan
   *  lapsed while it sat there — a restore code from the Knowledge Base team. */
  const restore = async (d: DeletedOrg) => {
    // Ask, and keep asking with the reason shown in the sheet. A rejected password that
    // just closes the dialog is indistinguishable from the button not working.
    let pw: string | null = null;
    let pwError: string | undefined;
    for (let attempt = 0; attempt < 5 && pw === null; attempt += 1) {
      pw = await dialogs.promptPassword({
        title: `Restore "${d.name}"`,
        message: "Enter the organization's Supreme password to bring it back.",
        label: "Supreme password",
        minLength: 1,
        submitLabel: "Restore",
        error: pwError,
      });
      if (pw === null) return; // cancelled
      try {
        await orgs.undelete(d.id, pw);
        dialogs.toast(`${d.name} is back.`, "success");
        onChanged();
        return;
      } catch (e) {
        // A wrong password is retryable and stays in the loop; anything else (a lapsed
        // plan needing a restore code) falls through to the handling below.
        if (e instanceof ApiError && e.status === 401) {
          pwError = `${e.message}. Check for caps lock and try again.`;
          pw = null;
          continue;
        }
        break;
      }
    }
    if (pw === null) return;
    try {
      await orgs.undelete(d.id, pw);
      dialogs.toast(`${d.name} is back.`, "success");
      onChanged();
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Restore failed";
      if (!/expired/i.test(msg)) {
        dialogs.toast(msg, "danger");
        return;
      }
      await dialogs.alert({ title: "Plan expired", message: msg, tone: "danger" });
      const hasCode = await dialogs.confirm({
        title: "Have a restore code?",
        message:
          "If the Knowledge Base team sent you a restore code (check your mailbox), enter it next. Otherwise, choose a plan on the Pricing page first.",
        confirmLabel: "Enter restore code",
        cancelLabel: "Go to Pricing",
      });
      if (!hasCode) {
        router.push("/pricing");
        return;
      }
      const code = await dialogs.promptPassword({
        title: "Restore code",
        message: "Paste the one-time restore code from your mailbox.",
        label: "Restore code",
        minLength: 8,
        submitLabel: "Restore",
      });
      if (!code) return;
      try {
        await orgs.undelete(d.id, pw, code);
        dialogs.toast(`${d.name} is back.`, "success");
        onChanged();
      } catch (e2) {
        dialogs.toast(e2 instanceof Error ? e2.message : "Restore failed", "danger");
      }
    }
  };

  const reviveFromMain = async (form: HTMLFormElement) => {
    const d = new FormData(form);
    const file = d.get("main") as File;
    const password = String(d.get("password"));
    const done = (res: Awaited<ReturnType<typeof vaultFiles.revive>>) => {
      setOpen(false);
      dialogs.alert({
        title: "Organization revived",
        message: `Roles: ${res.report.rolesRestored}, matched people: ${res.report.peopleMatched}, pending (re-attach on registration): ${res.report.peoplePending}, courses: ${res.report.coursesRestored}. Media is marked unreachable until storage is reconnected.`,
        tone: "success",
      });
      router.push(`/orgs/${res.orgId}`);
    };
    setBusy(true);
    try {
      const b64 = await fileToBase64(file);
      try {
        done(await vaultFiles.revive(b64, password));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Revival failed";
        if (!/expired/i.test(msg)) throw err;
        // Expired/legacy plan: explain, then let them supply a restore code.
        await dialogs.alert({ title: "Plan expired", message: msg, tone: "danger" });
        const hasCode = await dialogs.confirm({
          title: "Have a restore code?",
          message:
            "Enter the one-time restore code from your mailbox, or choose a plan on the Pricing page to get one.",
          confirmLabel: "Enter restore code",
          cancelLabel: "Go to Pricing",
        });
        if (!hasCode) {
          router.push("/pricing");
          return;
        }
        const code = await dialogs.promptPassword({
          title: "Restore code",
          message: "Paste the restore code from your mailbox.",
          label: "Restore code",
          minLength: 8,
          submitLabel: "Restore",
        });
        if (code) done(await vaultFiles.revive(b64, password, code));
      }
    } catch (err) {
      dialogs.toast(err instanceof Error ? err.message : "Revival failed", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recovery-dock" ref={panelRef}>
      <button
        type="button"
        className="recovery-btn"
        data-open={open}
        aria-expanded={open}
        aria-controls="recovery-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="recovery-btn-icon" aria-hidden>
          <IconRecovery size={20} />
        </span>
        <span className="recovery-btn-label">Recovery</span>
        {deleted.length > 0 && <span className="recovery-btn-count">{deleted.length}</span>}
      </button>

      {open && (
        <section className="recovery-panel glass-strong" id="recovery-panel" aria-label="Recovery">
          <header className="recovery-panel-head">
            <div>
              <strong>Recovery</strong>
              <p className="auth-sub">
                Nothing you delete disappears straight away. Bring an organization back from
                here.
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close recovery"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </header>

          <div className="recovery-tabs" role="tablist">
            <button
              role="tab"
              aria-selected={tab === "bin"}
              className={`btn btn-small ${tab === "bin" ? "btn-primary" : "btn-quiet"}`}
              onClick={() => setTab("bin")}
            >
              Deleted{deleted.length > 0 ? ` (${deleted.length})` : ""}
            </button>
            <button
              role="tab"
              aria-selected={tab === "main"}
              className={`btn btn-small ${tab === "main" ? "btn-primary" : "btn-quiet"}`}
              onClick={() => setTab("main")}
            >
              From a .main file
            </button>
          </div>

          {tab === "bin" && (
            <div className="recovery-body">
              {deleted.length === 0 ? (
                <p className="auth-sub recovery-empty">
                  Nothing deleted. An organization you delete waits here for 30 days, fully
                  intact, before it is purged — after that, only its <code>.main</code> file
                  can bring it back.
                </p>
              ) : (
                <ul className="recovery-list">
                  {deleted.map((d) => {
                    const daysLeft = Math.max(
                      0,
                      Math.ceil((new Date(d.purgeAt).getTime() - Date.now()) / 86400_000),
                    );
                    return (
                      <li key={d.id} className="recovery-item">
                        <div className="recovery-item-body">
                          <strong>{d.name}</strong>
                          <span className="chip">#{d.orgNumber}</span>
                          <p className="auth-sub" data-soon={daysLeft <= 5}>
                            Purges in {daysLeft} day{daysLeft === 1 ? "" : "s"} ·{" "}
                            {d.purgeAt.slice(0, 10)}
                          </p>
                        </div>
                        <button className="btn btn-primary btn-small" onClick={() => restore(d)}>
                          ↩ Restore
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === "main" && (
            <div className="recovery-body">
              <p className="auth-sub recovery-note">
                A <code>.main</code> file is an organization&apos;s existence backup, encrypted
                with its Supreme password. This is the way back after the 30 days are up — and
                the only one.
              </p>
              <form
                className="recovery-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void reviveFromMain(e.currentTarget);
                }}
              >
                <label className="field">
                  <span>.main file</span>
                  <input name="main" type="file" accept=".main" required />
                </label>
                <label className="field">
                  <span>Supreme password</span>
                  <input name="password" type="password" required />
                </label>
                <button className="btn btn-primary btn-small" disabled={busy}>
                  {busy ? "Reviving…" : "Revive organization"}
                </button>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
