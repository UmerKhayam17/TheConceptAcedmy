/** Local calendar YYYY-MM-DD (avoids UTC shift for Asia/Karachi mornings). */
export function localTodayYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localDateYmd(date: Date) {
  return localTodayYmd(date);
}
