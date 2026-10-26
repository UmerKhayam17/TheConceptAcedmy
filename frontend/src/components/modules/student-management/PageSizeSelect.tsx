export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export default function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (size: number) => void;
}) {
  return (
    <label className="inline-flex h-9 w-fit shrink-0 items-center gap-2 self-start rounded-lg border border-border bg-background pl-3 pr-2 text-sm shadow-sm">
      <span className="text-xs font-medium text-muted-foreground">Rows</span>
      <select
        className="h-8 bg-transparent pr-1 text-sm font-semibold text-foreground outline-none"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Rows per page"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
