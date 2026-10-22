import { useTranslation } from "react-i18next";

/** A key drawn as a button: inverted colors (white on dark, black on light) for the highest contrast. */
function Key({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-primary bg-primary px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-none text-primary-fg shadow-[0_2px_0_0_var(--nx-text-dim)]">
      {children}
    </kbd>
  );
}

const HINTS = [
  { action: "remove", keys: ["Ctrl", "Del"] },
  { action: "start", keys: ["Ctrl", "I"] },
  { action: "stop", keys: ["Ctrl", "."] },
] as const;

/** The canvas shortcuts, as keycaps with what each does. */
export function ShortcutHints() {
  const { t } = useTranslation();
  return (
    <ul
      className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t border-line bg-bg1/90 px-5 pb-4 pt-3 backdrop-blur"
      aria-label={t("topology.shortcuts")}
    >
      {HINTS.map(({ action, keys }) => (
        <li key={action} className="flex items-center justify-between text-xs">
          <span className="text-fg">{t(`topology.shortcut.${action}`)}</span>
          <span className="flex items-center gap-1">
            {keys.map((k, i) => (
              <span key={k} className="flex items-center gap-1">
                {i > 0 && <span className="text-dim">+</span>}
                <Key>{k}</Key>
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}
