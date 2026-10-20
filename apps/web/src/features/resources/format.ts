export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
};

export const formatDate = (epochSeconds: number, locale: string): string =>
  epochSeconds > 0 ? new Date(epochSeconds * 1000).toLocaleDateString(locale) : "—";
