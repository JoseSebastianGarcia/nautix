import { Loader2, X } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useIsAdmin } from "../app/queries.js";
import { HelpButton } from "../help/help-button.js";
import type { TopicId } from "../help/topics.js";
import { useToasts } from "./toast-store.js";

type Variant = "primary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  ghost: "border border-line bg-bg1 text-fg hover:bg-bg2",
  danger: "bg-danger text-white hover:opacity-90",
};

export function Button({
  variant = "ghost",
  className = "",
  write = false,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; write?: boolean }) {
  const isAdmin = useIsAdmin();
  return (
    <button
      type="button"
      disabled={disabled || (write && !isAdmin)}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the labelled control is passed in as children
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-dim">{label}</span>
      {children}
      {hint && <span className="text-xs text-dim">{hint}</span>}
    </label>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-lg border border-line bg-bg0 px-3 py-2 font-mono text-sm text-fg placeholder:text-dim ${className}`}
      {...rest}
    />
  );
}

/** Native <dialog>: focus trap, Esc to close and aria-modal for free. */
export function Dialog({
  open,
  onClose,
  title,
  help,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Help topic behind a small "?" next to the title. */
  help?: TopicId;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      // A dialog inside this one (a confirmation over a browser) must not close this one when it closes.
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label={title}
      className="nx-glass nx-glass-dense nx-lens-tall m-auto max-h-[92vh] w-[min(32rem,92vw)] overflow-y-auto rounded-3xl border-0 p-0 text-fg backdrop:bg-black/50"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{title}</h2>
            {help && <HelpButton topic={help} />}
            <button
              type="button"
              aria-label={t("common.close")}
              title={t("common.close")}
              onClick={() => ref.current?.close()}
              className="ml-auto rounded-full p-1.5 text-dim hover:bg-bg2 hover:text-fg"
            >
              <X size={16} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  command,
  danger = true,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  command?: string;
  danger?: boolean;
  /** Names the action itself (Delete) instead of the generic Confirm. */
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <p className="text-sm text-dim">{body}</p>
      {command && <ShowCommand command={command} />}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel ?? t("common.confirm")}
        </Button>
      </div>
    </Dialog>
  );
}

/** Every action reveals the equivalent docker CLI line. */
export function ShowCommand({ command }: { command: string }) {
  const { t } = useTranslation();
  const push = useToasts((s) => s.push);
  return (
    <details className="rounded-lg border border-line bg-bg0 text-xs">
      <summary className="cursor-pointer select-none px-3 py-2 text-dim">
        {t("common.showCommand")}
      </summary>
      <div className="flex items-start justify-between gap-2 border-t border-line px-3 py-2">
        <code className="break-all font-mono text-fg">{command}</code>
        <button
          type="button"
          className="shrink-0 text-accent"
          onClick={() => {
            void navigator.clipboard?.writeText(command);
            push("ok", t("common.copied"));
          }}
        >
          {t("common.copy")}
        </button>
      </div>
    </details>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismiss(toast.id)}
          className="nx-glass nx-lens-wide pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-left text-sm text-fg"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              toast.kind === "ok" ? "bg-ok" : toast.kind === "error" ? "bg-danger" : "bg-accent"
            }`}
            aria-hidden="true"
          />
          {toast.kind === "pending" && <Loader2 size={14} className="animate-spin text-accent" />}
          {toast.text}
        </button>
      ))}
    </div>
  );
}
