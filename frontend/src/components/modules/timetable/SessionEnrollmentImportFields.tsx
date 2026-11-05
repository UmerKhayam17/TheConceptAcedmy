import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchSessions } from "@/lib/configApi";
import { fetchAcademyClasses } from "@/lib/studentManagementApi";

export type SessionImportFormState = {
  enabled: boolean;
  sourceSessionId: string;
  mode: "all" | "selected";
  classIds: string[];
  includeFeeStructure: boolean;
};

export function defaultSessionImportForm(): SessionImportFormState {
  return {
    enabled: false,
    sourceSessionId: "",
    mode: "all",
    classIds: [],
    includeFeeStructure: true,
  };
}

export function validateSessionImportForm(form: SessionImportFormState): string | null {
  if (!form.enabled) return null;
  if (!form.sourceSessionId) return "Choose a source session to shift from.";
  if (form.mode === "selected" && form.classIds.length === 0) {
    return "Select at least one class to import.";
  }
  return null;
}

export function buildSessionImportPayload(form: SessionImportFormState) {
  return {
    sourceSessionId: form.sourceSessionId,
    classIds: form.mode === "selected" ? form.classIds : undefined,
    includeFeeStructure: form.includeFeeStructure,
  };
}

export default function SessionEnrollmentImportFields({
  excludeSessionId,
  value,
  onChange,
}: {
  excludeSessionId?: string;
  value: SessionImportFormState;
  onChange: (next: SessionImportFormState) => void;
}) {
  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: () => fetchSessions(),
  });

  const sourceOptions = sessions.filter((s) => s._id !== excludeSessionId);

  const { data: sourceClasses = [], isLoading: classesLoading } = useQuery({
    queryKey: ["academy-classes", value.sourceSessionId],
    queryFn: () => fetchAcademyClasses({ sessionId: value.sourceSessionId, status: "active" }),
    enabled: value.enabled && !!value.sourceSessionId,
  });

  const patch = (partial: Partial<SessionImportFormState>) => onChange({ ...value, ...partial });

  return (
    <div className="space-y-3 pt-2 border-t border-border">
      <div className="flex items-start gap-2">
        <Checkbox
          id="import-enrollment"
          checked={value.enabled}
          onCheckedChange={(checked) => {
            if (checked === true) {
              patch({ enabled: true });
            } else {
              onChange(defaultSessionImportForm());
            }
          }}
        />
        <div>
          <Label htmlFor="import-enrollment" className="cursor-pointer font-medium">
            Shift full configuration from a previous session
          </Label>
        </div>
      </div>

      {value.enabled && (
        <>
          <div>
            <Label>Source session</Label>
            <Select
              value={value.sourceSessionId || undefined}
              onValueChange={(id) => patch({ sourceSessionId: id, classIds: [], mode: "all" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose session…" />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No Other Sessions Available
                  </SelectItem>
                ) : (
                  sourceOptions.map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {value.sourceSessionId && (
            <>
              <div className="space-y-2">
                <Label>What to import</Label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="import-mode"
                      className="accent-accent"
                      checked={value.mode === "all"}
                      onChange={() => patch({ mode: "all", classIds: [] })}
                    />
                    All classes (with their sections and subjects)
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="import-mode"
                      className="accent-accent"
                      checked={value.mode === "selected"}
                      onChange={() => patch({ mode: "selected" })}
                    />
                    Selected classes only (sections & subjects for those classes)
                  </label>
                </div>
              </div>

              {value.mode === "selected" && (
                <div className="rounded-md border border-border p-3 space-y-2 max-h-40 overflow-y-auto">
                  {classesLoading ? (
                    <p className="text-xs text-muted-foreground">Loading classes…</p>
                  ) : sourceClasses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No classes in source session.</p>
                  ) : (
                    sourceClasses.map((cls) => (
                      <label key={cls._id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={value.classIds.includes(cls._id)}
                          onCheckedChange={(checked) => {
                            const ids =
                              checked === true
                                ? [...value.classIds, cls._id]
                                : value.classIds.filter((id) => id !== cls._id);
                            patch({ classIds: ids });
                          }}
                        />
                        {cls.className}
                      </label>
                    ))
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="import-fees"
                  checked={value.includeFeeStructure}
                  onCheckedChange={(checked) => patch({ includeFeeStructure: checked === true })}
                />
                <Label htmlFor="import-fees" className="cursor-pointer text-sm font-normal">
                  Include fee structure per class
                </Label>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
