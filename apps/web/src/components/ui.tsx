import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsAdmin } from "../app/queries.js";
import { useToasts } from "./toast-store.js";

type Variant = "primary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
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
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
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
      onClose={onClose}
      aria-label={title}
      className="m-auto w-[min(32rem,92vw)] rounded-2xl border border-line bg-bg1 p-0 text-fg backdrop:bg-black/60"
    >
      {open && (
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">{title}</h2>
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
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  command?: string;
  danger?: boolean;
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
          {t("common.confirm")}
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
          className={`pointer-events-auto rounded-lg border px-4 py-2 text-left text-sm shadow-lg ${
            toast.kind === "ok" ? "border-ok bg-bg1 text-fg" : "border-danger bg-bg1 text-fg"
          }`}
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}

/** Asks the user to type a name before a risky action (used to protect Nautix's own container). */
export function TypeConfirmDialog({
  open,
  name,
  onConfirm,
  onClose,
}: {
  open: boolean;
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState("");
  return (
    <Dialog open={open} onClose={onClose} title={t("self.title")}>
      <p className="text-sm text-amber">{t("self.body")}</p>
      <Field label={t("self.typeName")}>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoFocus
        />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>{t("common.cancel")}</Button>
        <Button
          variant="danger"
          disabled={typed !== name}
          onClick={() => {
            setTyped("");
            onConfirm();
            onClose();
          }}
        >
          {t("common.confirm")}
        </Button>
      </div>
    </Dialog>
  );
}
