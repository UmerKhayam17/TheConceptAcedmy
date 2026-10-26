import type { ReactNode } from "react";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import FilterToolbar, { FilterToolbarActions } from "@/components/modules/FilterToolbar";

/** Standard toolbar row: search on the left, actions on the right. */
export default function PanelToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  children,
  className,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <FilterToolbar className={className}>
      <PanelSearchBar value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />
      {children ? <FilterToolbarActions>{children}</FilterToolbarActions> : null}
    </FilterToolbar>
  );
}
