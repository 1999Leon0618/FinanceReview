export function taipeiDateTimeInput(now = new Date()): string {
  return now
    .toLocaleString("sv-SE", {
      timeZone: "Asia/Taipei",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(" ", "T");
}

export function parseTaipeiDateTimeInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  if (Number.isNaN(date.getTime()) || taipeiDateTimeInput(date) !== value)
    return null;
  return date.toISOString();
}

export function capturedAfterLatest(
  capturedAt: string,
  latestCapturedAt?: string | null,
): boolean {
  return (
    !latestCapturedAt || Date.parse(capturedAt) > Date.parse(latestCapturedAt)
  );
}
