"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createOrgSchema } from "@vault/shared";
import type { PlatformRequestView, PricingPlanView } from "@vault/shared";
import { ApiError } from "@/lib/auth-client";
import { orgs } from "@/lib/orgs-client";
import { pricing } from "@/lib/pricing-client";
import { AppShell } from "@/components/AppShell";
import { useDialogs } from "@/components/dialogs";
import { IconGrid, IconHelp, IconUser } from "@/components/icons";
import { StorageSetupFields, emptyStorageConfig } from "@/components/StorageSetupFields";
import { OrgLogoField } from "@/components/OrgLogoField";
import type { StorageConfigInput } from "@vault/shared";

const NAV = [
  { href: "/orgs", label: "Organizations", icon: <IconGrid /> },
  { href: "/pricing", label: "Pricing", icon: <span aria-hidden>🪙</span> },
  { href: "/account", label: "Account", icon: <IconUser /> },
  { href: "/help", label: "Help", icon: <IconHelp /> },
];

export default function NewOrgPage() {
  const router = useRouter();
  const dialogs = useDialogs();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Where this organization's documents will live (docs/structure.md §9.3). Tested
  // before the organization is created, so a failed test costs nothing.
  const [storage, setStorage] = useState<StorageConfigInput>(emptyStorageConfig);
  // Where the documents go. NAS is the ordinary answer; KVEP is our staff perk, which
  // skips storage entirely and keeps content in our database (docs/structure.md §9.13).
  const [mode, setMode] = useState<"NAS" | "KVEP">("NAS");
  const [kvepUser, setKvepUser] = useState("");
  const [kvepPass, setKvepPass] = useState("");
  const [kvepCheck, setKvepCheck] = useState<"idle" | "checking" | "ok" | "bad">("idle");
  // The reason, not just the fact. A blanket "wrong password" hides the far likelier
  // causes — the endpoint not deployed yet, or the API asleep.
  const [kvepCheckMsg, setKvepCheckMsg] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [orgName, setOrgName] = useState("");
  // Whether the CURRENT storage settings have been proven to work. Creating an organization
  // against storage nobody has reached produces one that cannot accept a single upload, and
  // the owner only finds out later — so the test is a gate, not a courtesy. Editing any
  // field clears it again (StorageSetupFields calls back with false).
  const [storageTested, setStorageTested] = useState(false);
  // Switching between NAS and KVEP swaps which proof is required, and neither carries over.
  const proofReady = mode === "NAS" ? storageTested : kvepCheck === "ok";
  const proofNote =
    mode === "NAS"
      ? "Run “Test connection” on your storage first — an organization whose storage cannot be reached can never accept an upload."
      : "Check the super-admin credentials first — the employee perk is only granted against an account we can verify.";

  // Plan chooser (shown beside the form)
  const [plans, setPlans] = useState<PricingPlanView[]>([]);
  const [coins, setCoins] = useState<number | null>(null);
  const [mine, setMine] = useState<PlatformRequestView[]>([]);
  const [customFor, setCustomFor] = useState<string | null>(null);

  const loadPlans = useCallback(() => {
    pricing.view().then((v) => setPlans(v.plans)).catch(() => undefined);
    pricing.wallet().then((w) => setCoins(w.coins)).catch(() => undefined);
    pricing.myRequests().then((r) => setMine(r.requests)).catch(() => undefined);
  }, []);
  useEffect(() => loadPlans(), [loadPlans]);

  const requestFixed = async (plan: PricingPlanView) => {
    if (
      !(await dialogs.confirm({
        title: `Request the ${plan.name} plan?`,
        message: `The Knowledge Base team reviews it and sends your one-time access code to your notifications.${plan.priceCoins ? ` This plan costs ${plan.priceCoins} coins on creation.` : ""}`,
        confirmLabel: "Send request",
      }))
    )
      return;
    // A KVEP request asks for an employee-perk code. The plan and the review are the same
    // as any other; the code it produces is what lets creation skip storage setup.
    await pricing.request({ kind: mode === "KVEP" ? "KVEP_ORG" : "CREATE_ORG", planKey: plan.key });
    dialogs.toast(
      mode === "KVEP"
        ? "Employee-perk request sent — your code will arrive in your notifications."
        : "Request sent — your code will arrive in your notifications.",
      "success",
    );
    loadPlans();
  };

  const submitCustom = async (plan: PricingPlanView, days: number, offered: number) => {
    await pricing.request({ kind: "CUSTOM_PLAN", planKey: plan.key, requestedDays: days, offeredCoins: offered });
    setCustomFor(null);
    dialogs.toast("Proposal sent — the admin will reply in your notifications.", "success");
    loadPlans();
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    if (data.get("supremePassword") !== data.get("supremePassword2")) {
      setError("Supreme passwords do not match");
      return;
    }
    const parsed = createOrgSchema.safeParse({
      name: data.get("name"),
      ownerRoleName: data.get("ownerRoleName"),
      supremePassword: data.get("supremePassword"),
      acknowledgedUnrecoverable: data.get("ack") === "on" ? true : false,
      accessCode: String(data.get("accessCode") ?? "").trim(),
      // A KVEP organization sends no storage at all — it uses ours — and instead proves
      // the creator is one of our staff.
      ...(mode === "KVEP"
        ? { kvepAdmin: { username: kvepUser.trim(), password: kvepPass } }
        : { storage }),
      ...(logo ? { logo } : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      const org = await orgs.create(parsed.data);
      router.push(`/orgs/${org.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server");
      setBusy(false);
    }
  }

  return (
    <AppShell
      nav={NAV}
      title="Create an organization"
      subtitle="This creates the organization's Supreme — its root object — and its first role, with you as the first owner."
    >
      <div className="create-org-grid">
        {/* ── Left: the create form ─────────────────────────────────────── */}
        <form className="auth-card glass" onSubmit={submit} style={{ margin: 0 }}>
          <div className="warn-box" style={{ marginTop: 0 }}>
            <strong>You need an access code to create an organization.</strong>
            <p>
              Pick a plan on the right → the Knowledge Base team approves it → your one-time
              code arrives in your <Link href="/account">notifications</Link>. Paste it below.
            </p>
          </div>
          {/* Not a <label> wrapping everything, the way the other fields are: this one
              carries a link and a help button, and interactive controls inside a label
              hand their clicks to the input as well. The label is bound by `htmlFor`
              instead, so pressing "See pricing" does exactly one thing.

              Somebody reaching this field without a code is stuck, and the answer — pick a
              plan, wait for approval — was only written above the form, where they have
              already scrolled past it. Both routes out are here now. */}
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="accessCode">
                <span>Access code</span>
              </label>
              <span className="field-label-aids">
                <button
                  type="button"
                  className="field-help"
                  aria-label="How do I get an access code?"
                  data-hint-title="How to get an access code"
                  data-hint="Choose a plan — on the panel beside this form, or on the Pricing page — and send the request. The Knowledge Base team reviews it and your one-time code arrives in your notifications. One code creates one organization."
                >
                  ?
                </button>
                <Link href="/pricing" className="btn btn-quiet btn-tiny">
                  See pricing →
                </Link>
              </span>
            </div>
            <input
              id="accessCode"
              name="accessCode"
              required
              placeholder="8-character code from your notifications"
              autoCapitalize="characters"
            />
            <small>
              The super-admin sends this after approving your plan request. No code yet?{" "}
              <Link href="/pricing">Compare the plans</Link>, or request one from the panel
              beside this form.
            </small>
          </div>
          <label className="field">
            <span>Organization name</span>
            <input
              name="name"
              required
              minLength={2}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </label>
          <OrgLogoField name={orgName} value={logo} onChange={setLogo} />
          <label className="field">
            <span>First role name</span>
            <input name="ownerRoleName" placeholder="Owner / CEO / Principal…" required />
            <small>The role at the top of your structure — you become its first occupant</small>
          </label>
          <label className="field">
            <span>Supreme password</span>
            <input name="supremePassword" type="password" minLength={12} required />
            <small>At least 12 characters</small>
          </label>
          <label className="field">
            <span>Repeat Supreme password</span>
            <input name="supremePassword2" type="password" required />
          </label>

          <div className="warn-box">
            <strong>This password cannot be recovered. By anyone. Ever.</strong>
            <p>
              The platform stores no copy — it protects owner-level changes and encrypts your
              organization&apos;s <code>.main</code> revival file. If it is lost, changing the
              owner structure and reviving a deleted organization become permanently
              impossible.
            </p>
            <label className="ack-row">
              <input type="checkbox" name="ack" />
              <span>I understand the Supreme password is unrecoverable</span>
            </label>
          </div>

          <hr className="soft-rule" />
          <h3 className="section-heading">Where your documents will live</h3>

          <div className="mode-choice">
            <label className="ack-row">
              <input
                type="radio"
                name="storageMode"
                checked={mode === "NAS"}
                onChange={() => setMode("NAS")}
              />
              <span>
                <strong>NAS — your own storage.</strong> Your documents live on hardware you
                own and control. The space is yours, the cost is yours, and you can walk
                away with everything at any time.
              </span>
            </label>
            <label className="ack-row">
              <input
                type="radio"
                name="storageMode"
                checked={mode === "KVEP"}
                onChange={() => setMode("KVEP")}
              />
              <span>
                <strong>KVEP — Knowledge Vault Employee Perk.</strong> Documents stay on
                Knowledge Vault&rsquo;s own storage, with no setup at all. Reserved for our
                staff: it needs a super-admin username and password.
              </span>
            </label>
          </div>

          {mode === "NAS" ? (
            <StorageSetupFields
              value={storage}
              onChange={setStorage}
              onTested={setStorageTested}
              webOrigin={typeof window === "undefined" ? "" : window.location.origin}
            />
          ) : (
            <div className="kvep-fields">
              <div className="info-box">
                <strong>This organization will use Knowledge Vault&rsquo;s storage.</strong>
                <p>
                  Nothing to set up, and the plan&rsquo;s storage allowance applies as it
                  always did. Plans and access codes work exactly as usual — any approved
                  code will do. The super-admin credentials below are what make it an
                  employee perk.
                </p>
              </div>
              <label className="field">
                <span>Super-admin username</span>
                <input
                  value={kvepUser}
                  onChange={(e) => {
                    setKvepUser(e.target.value);
                    // The tick belonged to the credentials that were checked, not to
                    // whatever is in the boxes now.
                    setKvepCheck("idle");
                    setKvepCheckMsg(null);
                  }}
                  autoComplete="off"
                  placeholder="adminbase"
                />
              </label>
              <label className="field">
                <span>Super-admin password</span>
                <input
                  type="password"
                  value={kvepPass}
                  onChange={(e) => {
                    setKvepPass(e.target.value);
                    setKvepCheck("idle");
                    setKvepCheckMsg(null);
                  }}
                  autoComplete="new-password"
                />
                <small>
                  <strong>The same username and password you sign in to the super-admin
                  portal with</strong> — checked against exactly that account. It is never
                  stored with the organization; it only proves the perk is going to one of
                  our own.
                </small>
              </label>
              <div className="storage-test-row">
                <button
                  type="button"
                  className="btn"
                  disabled={kvepCheck === "checking" || !kvepUser.trim() || !kvepPass}
                  onClick={async () => {
                    setKvepCheck("checking");
                    setKvepCheckMsg(null);
                    try {
                      await orgs.verifyKvep(kvepUser.trim(), kvepPass);
                      setKvepCheck("ok");
                    } catch (err) {
                      setKvepCheck("bad");
                      if (err instanceof ApiError && err.status === 401) {
                        setKvepCheckMsg(
                          "That username and password were not accepted. Use the same ones you sign in to the super-admin portal with, at /kbase.",
                        );
                      } else if (err instanceof ApiError && err.status === 404) {
                        setKvepCheckMsg(
                          "This check is not available on the server yet — it ships with the employee-perk feature. Your credentials were not tested. Wait for the API to finish deploying and try again.",
                        );
                      } else {
                        setKvepCheckMsg(
                          err instanceof ApiError
                            ? `The check could not run (${err.status}): ${err.message}`
                            : "The check could not reach the server. It may be waking up — try again in a moment.",
                        );
                      }
                    }
                  }}
                >
                  {kvepCheck === "checking" ? "Checking…" : "Check credentials"}
                </button>
                {kvepCheck === "ok" && (
                  <span className="ok-text">✓ Recognised — these are valid super-admin credentials.</span>
                )}
              </div>
              {kvepCheck === "bad" && kvepCheckMsg && (
                <p className="form-error">{kvepCheckMsg}</p>
              )}
            </div>
          )}

          {error && <p className="form-error">{error}</p>}
          {!proofReady && <p className="insp-warn create-org-gate">{proofNote}</p>}
          <button
            className="btn btn-primary btn-block"
            disabled={busy || !proofReady}
            data-hint={proofReady ? undefined : proofNote}
            data-hint-title={proofReady ? undefined : "Not ready yet"}
            data-hint-tone={proofReady ? undefined : "required"}
          >
            {busy ? "Creating…" : "Create organization"}
          </button>
        </form>

        {/* ── Right: choose a plan ──────────────────────────────────────── */}
        <aside className="plan-chooser glass">
          <div className="plan-chooser-head">
            <h2>Choose a plan</h2>
            <span className="coins-badge">
              🪙 <strong>{coins ?? "…"}</strong> coins
            </span>
          </div>
          <p className="auth-sub">
            Request a plan here; the code arrives in your notifications. Full details on the{" "}
            <Link href="/pricing">Pricing page</Link>.
          </p>

          {plans.map((p) => {
            const req = mine.find((m) => m.planKey === p.key && (m.status === "PENDING" || m.status === "APPROVED"));
            return (
              <div key={p.key} className="plan-mini">
                <div className="plan-mini-head">
                  <strong>{p.name}</strong>
                  <span className="plan-mini-price">{p.priceCoins === 0 ? "Free" : `${p.priceCoins} 🪙`}</span>
                </div>
                <span className="auth-sub">{p.durationDays ? `${p.durationDays} days` : p.isCustom ? "Custom duration" : "Unlimited"} · 👥 {p.memberLimit != null ? `up to ${p.memberLimit}` : p.isCustom ? "custom limit" : "unlimited"}</span>
                {p.tagline && <p className="auth-sub" style={{ fontSize: "0.8rem" }}>{p.tagline}</p>}

                {req ? (
                  <span className={`badge ${req.status === "APPROVED" ? "badge-ok" : ""}`}>
                    {req.status === "APPROVED" ? "approved — code in your 🔔" : "requested — awaiting approval"}
                  </span>
                ) : p.isCustom && customFor === p.key ? (
                  <form
                    className="plan-mini-custom"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const d = new FormData(e.currentTarget);
                      submitCustom(p, Number(d.get("days")), Number(d.get("coins")));
                    }}
                  >
                    <input name="days" type="number" min={1} placeholder="Days" required />
                    <input name="coins" type="number" min={0} placeholder="Coins you offer" required />
                    <div className="tree-actions">
                      <button className="btn btn-primary btn-small">Send</button>
                      <button type="button" className="btn btn-quiet btn-small" onClick={() => setCustomFor(null)}>Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="btn btn-quiet btn-small"
                    onClick={() => (p.isCustom ? setCustomFor(p.key) : requestFixed(p))}
                  >
                    {p.isCustom ? "Propose terms" : "Request this plan"}
                  </button>
                )}
              </div>
            );
          })}
        </aside>
      </div>
    </AppShell>
  );
}
