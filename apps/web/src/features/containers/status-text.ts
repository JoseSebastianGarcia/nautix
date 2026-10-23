import type { TFunction } from "i18next";

const UNITS = ["second", "minute", "hour", "day", "week", "month", "year"] as const;

/** Docker's duration words ("3 minutes", "About an hour", "Less than a second") in the UI language. */
const duration = (raw: string, t: TFunction): string | null => {
  const text = raw.trim().toLowerCase();
  if (text === "less than a second") return t("status.time.lessThanSecond");
  if (text === "about a minute") return t("status.time.aboutMinute");
  if (text === "about an hour") return t("status.time.aboutHour");
  const m = /^(\d+) (second|minute|hour|day|week|month|year)s?$/.exec(text);
  if (!m?.[1] || !m[2] || !UNITS.includes(m[2] as (typeof UNITS)[number])) return null;
  return t(`status.time.${m[2]}`, { count: Number(m[1]) });
};

/**
 * The engine's status line ("Up 3 minutes (healthy)", "Exited (0) 2 hours ago") in the UI language. Anything
 * that does not match a known shape is returned as the engine wrote it.
 */
export const statusText = (status: string, t: TFunction): string => {
  const health = /\s*\((healthy|unhealthy|health: starting)\)$/.exec(status);
  const base = health ? status.slice(0, health.index) : status;
  const tail = health
    ? ` (${t(health[1] === "healthy" ? "status.healthy" : health[1] === "unhealthy" ? "status.unhealthy" : "status.starting")})`
    : "";
  const up = /^Up (.+)$/.exec(base);
  if (up?.[1]) {
    const time = duration(up[1], t);
    if (time) return `${t("status.up", { time })}${tail}`;
  }
  const gone = /^(Exited|Restarting) \((-?\d+)\) (.+) ago$/.exec(base);
  if (gone?.[1] && gone[2] && gone[3]) {
    const time = duration(gone[3], t);
    if (time)
      return `${t(gone[1] === "Exited" ? "status.exited" : "status.restarting", { code: gone[2], time })}${tail}`;
  }
  if (base === "Created") return t("status.created");
  if (base === "Paused") return t("status.paused");
  return status;
};
