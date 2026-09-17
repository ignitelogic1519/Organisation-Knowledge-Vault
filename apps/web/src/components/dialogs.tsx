"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { passwordPolicyMessage } from "@vault/shared";
import { PasswordSetup } from "./PasswordSetup";

// The platform's single prompt surface: every confirmation, alert and password entry
// renders as a custom glass sheet rising from the bottom-center of the screen — no
// native browser popups anywhere. Toasts (transient notices) share the same anchor.

type Tone = "info" | "danger" | "success";

interface AlertOptions {
  title?: string;
  message: React.ReactNode;
  tone?: Tone;
}

interface ConfirmOptions {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PasswordOptions {
  title: string;
  message?: React.ReactNode;
  label?: string;
  submitLabel?: string;
  /**
   * A NEW password is being set here: the sheet asks for it twice and brings the whole
   * setup block with it — the live checklist and the strength meter. Left off, the sheet
   * is asking for a password that already exists (a Supreme gate, a restore) and shows
   * nothing but the field.
   */
  confirmEntry?: boolean;
  minLength?: number;
  /**
   * Shown inside the sheet when it reopens after the server rejected the last
   * attempt. A transient toast is not enough for a rejected password: the dialog
   * closing with nothing visible reads as "nothing happened".
   */
  error?: string;
}

interface DialogApi {
  alert: (opts: AlertOptions) => Promise<void>;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  promptPassword: (opts: PasswordOptions) => Promise<string | null>;
  toast: (message: string, tone?: Tone) => void;
}

type ActiveDialog =
  | { type: "alert"; opts: AlertOptions; resolve: () => void }
  | { type: "confirm"; opts: ConfirmOptions; resolve: (ok: boolean) => void }
  | { type: "password"; opts: PasswordOptions; resolve: (value: string | null) => void };

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialogs must be used inside <DialogProvider>");
  return ctx;
}

function PasswordSheet({
  opts,
  onDone,
}: {
  opts: PasswordOptions;
  onDone: (value: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(opts.error ?? null);
  const [chosen, setChosen] = useState("");
  const [confirm, setConfirm] = useState("");
  const min = opts.minLength ?? 8;

  return (
    <form
      className="sheet-body"
      onSubmit={(e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        if (opts.confirmEntry) {
          const problem = passwordPolicyMessage(chosen, opts.label ?? "Password");
          if (problem) {
            setError(`${problem}.`);
            return;
          }
          if (chosen !== confirm) {
            setError("The passwords don't match — retype them.");
            return;
          }
          onDone(chosen);
          return;
        }
        const pw = String(d.get("password") ?? "");
        if (pw.length < min) {
          setError(`At least ${min} characters.`);
          return;
        }
        onDone(pw);
      }}
    >
      {opts.message && <div className="sheet-msg">{opts.message}</div>}
      {opts.confirmEntry ? (
        <PasswordSetup
          value={chosen}
          onValueChange={(v) => {
            setChosen(v);
            setError(null);
          }}
          confirm={confirm}
          onConfirmChange={setConfirm}
          passwordLabel={opts.label ?? "Password"}
          autoFocus
        />
      ) : (
        <label className="field">
          <span>{opts.label ?? "Password"}</span>
          <input
            name="password"
            type="password"
            autoFocus
            required
            autoComplete="off"
            onChange={() => setError(null)}
          />
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="sheet-actions">
        <button type="button" className="btn btn-quiet" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {opts.submitLabel ?? "Continue"}
        </button>
      </div>
    </form>
  );
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastId = useRef(0);

  const alert = useCallback(
    (opts: AlertOptions) =>
      new Promise<void>((resolve) => setDialog({ type: "alert", opts, resolve })),
    [],
  );
  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setDialog({ type: "confirm", opts, resolve })),
    [],
  );
  const promptPassword = useCallback(
    (opts: PasswordOptions) =>
      new Promise<string | null>((resolve) => setDialog({ type: "password", opts, resolve })),
    [],
  );
  const toast = useCallback((message: string, tone: Tone = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const close = useCallback(() => setDialog(null), []);

  // Escape dismisses (as cancel / acknowledged)
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (dialog.type === "alert") dialog.resolve();
      else if (dialog.type === "confirm") dialog.resolve(false);
      else dialog.resolve(null);
      close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  const api: DialogApi = { alert, confirm, promptPassword, toast };

  return (
    <DialogContext.Provider value={api}>
      {children}

      {dialog && (
        <div
          className="sheet-layer"
          role="presentation"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (dialog.type === "alert") dialog.resolve();
            else if (dialog.type === "confirm") dialog.resolve(false);
            else dialog.resolve(null);
            close();
          }}
        >
          <div
            className="sheet glass-strong"
            role={dialog.type === "alert" ? "alertdialog" : "dialog"}
            aria-modal="true"
            data-tone={
              dialog.type === "alert"
                ? (dialog.opts.tone ?? "info")
                : dialog.type === "confirm" && dialog.opts.danger
                  ? "danger"
                  : "info"
            }
          >
            <span className="sheet-grip" aria-hidden />
            {dialog.type === "alert" && (
              <div className="sheet-body">
                {dialog.opts.title && <h3>{dialog.opts.title}</h3>}
                <div className="sheet-msg">{dialog.opts.message}</div>
                <div className="sheet-actions">
                  <button
                    className="btn btn-primary"
                    autoFocus
                    onClick={() => {
                      dialog.resolve();
                      close();
                    }}
                  >
                    OK
                  </button>
                </div>
              </div>
            )}

            {dialog.type === "confirm" && (
              <div className="sheet-body">
                {dialog.opts.title && <h3>{dialog.opts.title}</h3>}
                <div className="sheet-msg">{dialog.opts.message}</div>
                <div className="sheet-actions">
                  <button
                    className="btn btn-quiet"
                    onClick={() => {
                      dialog.resolve(false);
                      close();
                    }}
                  >
                    {dialog.opts.cancelLabel ?? "Cancel"}
                  </button>
                  <button
                    className={dialog.opts.danger ? "btn btn-danger" : "btn btn-primary"}
                    autoFocus
                    onClick={() => {
                      dialog.resolve(true);
                      close();
                    }}
                  >
                    {dialog.opts.confirmLabel ?? "Confirm"}
                  </button>
                </div>
              </div>
            )}

            {dialog.type === "password" && (
              <div className="sheet-body">
                <h3>{dialog.opts.title}</h3>
                <PasswordSheet
                  opts={dialog.opts}
                  onDone={(v) => {
                    dialog.resolve(v);
                    close();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast glass-strong" data-tone={t.tone}>
            {t.message}
          </div>
        ))}
      </div>
    </DialogContext.Provider>
  );
}
