import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { classDisplayName, groupClassesByProgram } from "@/lib/configApi";

export type ClassProgramOption = {
  _id: string;
  className?: string;
  name?: string;
};

type ClassProgramSelectProps = {
  value: string;
  onChange: (value: string) => void;
  classes: ClassProgramOption[];
  /** Empty value = all classes (Class Board style). */
  allowAll?: boolean;
  allLabel?: string;
  /** Placeholder when a specific class is required. */
  emptyLabel?: string;
  disabled?: boolean;
  id?: string;
  /** Pass `false` to hide the label (toolbar inline use). */
  label?: string | false;
  className?: string;
  selectClassName?: string;
  /** Extra text after the class name, e.g. session. */
  optionSuffix?: (c: ClassProgramOption) => string | undefined;
};

/** Class Board–style class dropdown: School / College optgroups + shared styling. */
export default function ClassProgramSelect({
  value,
  onChange,
  classes,
  allowAll = false,
  allLabel = "All classes (School + College)",
  emptyLabel = "Select class",
  disabled,
  id,
  label = "Class",
  className,
  selectClassName,
  optionSuffix,
}: ClassProgramSelectProps) {
  const classGroups = useMemo(() => groupClassesByProgram(classes), [classes]);

  return (
    <div className={cn("min-w-[140px]", className)}>
      {label !== false ? (
        <Label
          htmlFor={id}
          className="text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          {label}
        </Label>
      ) : null}
      <select
        id={id}
        className={cn(
          "w-full h-10 rounded-lg border bg-background px-3 text-sm",
          label !== false && "mt-1",
          selectClassName,
        )}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {allowAll ? (
          <option value="">{allLabel}</option>
        ) : (
          <option value="">{emptyLabel}</option>
        )}
        {classGroups.map((g) => (
          <optgroup key={g.key} label={g.label}>
            {g.classes.map((c) => {
              const suffix = optionSuffix?.(c);
              return (
                <option key={c._id} value={c._id}>
                  {classDisplayName(c)}
                  {suffix ? ` (${suffix})` : ""}
                </option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

/** Optgroup options only — for embedding inside an existing styled `<select>`. */
export function ClassProgramOptions({
  classes,
  allowAll = false,
  allLabel = "All classes (School + College)",
  emptyLabel = "Select class",
  optionSuffix,
}: {
  classes: ClassProgramOption[];
  allowAll?: boolean;
  allLabel?: string;
  emptyLabel?: string;
  optionSuffix?: (c: ClassProgramOption) => string | undefined;
}) {
  const classGroups = useMemo(() => groupClassesByProgram(classes), [classes]);
  return (
    <>
      {allowAll ? <option value="">{allLabel}</option> : <option value="">{emptyLabel}</option>}
      {classGroups.map((g) => (
        <optgroup key={g.key} label={g.label}>
          {g.classes.map((c) => {
            const suffix = optionSuffix?.(c);
            return (
              <option key={c._id} value={c._id}>
                {classDisplayName(c)}
                {suffix ? ` (${suffix})` : ""}
              </option>
            );
          })}
        </optgroup>
      ))}
    </>
  );
}
