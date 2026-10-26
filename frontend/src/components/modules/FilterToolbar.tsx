import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * List-page filter row.
 * Phones: one full-width control per line so labels and buttons stay inside the card.
 * sm and up: the existing wrapping row, with actions aligned to the end.
 */
export default function FilterToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-2",
        "sm:flex sm:flex-row sm:flex-wrap sm:items-center",
        "max-sm:[&>*]:min-w-0 max-sm:[&>*]:max-w-full",
        "max-sm:[&_select]:!w-full max-sm:[&_select]:!min-w-0 max-sm:[&_select]:!max-w-full",
        "max-sm:[&_input]:!w-full max-sm:[&_input]:!min-w-0 max-sm:[&_input]:!max-w-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Action cluster under the filters. Full-width buttons on phones; inline from sm. */
export function FilterToolbarActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 max-w-full flex-col gap-2 border-t border-border/70 pt-2.5",
        "sm:ml-auto sm:w-auto sm:max-w-full sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:border-0 sm:pt-0",
        "[&>*]:min-w-0 [&>*]:w-full sm:[&>*]:w-auto",
        "max-sm:[&>*]:!h-auto max-sm:[&>*]:!min-h-10 max-sm:[&>*]:!whitespace-normal",
        className,
      )}
    >
      {children}
    </div>
  );
}
