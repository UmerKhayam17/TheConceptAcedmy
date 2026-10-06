import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchSessions, isSessionWritable } from "@/lib/configApi";
import {
  fetchAcademyClasses,
  fetchAcademyStudents,
  fetchSectionsByClass,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import {
  PARENT_DEFAULT_MODULE_PERMISSIONS,
  type ModuleRegistryEntry,
} from "@/lib/staffApi";

export type ParentCreateSelection = {
  studentId: string | null;
  name: string;
  email: string;
  phone: string;
  password: string;
  modulePermissions: Record<string, string[]>;
};

function sanitizeEmailLocalPart(value: string) {
  return (
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 48) || "student"
  );
}

/** Match backend: sohaib.tces2026000002@concept.edu.pk */
export function buildParentPortalEmail(studentName: string, studentId: string) {
  const namePart = sanitizeEmailLocalPart(studentName);
  const idPart = sanitizeEmailLocalPart(studentId);
  return `${namePart}.${idPart}@concept.edu.pk`;
}

function studentEmailOf(s: AcademyStudent): string {
  const existing = String(s.guardianEmail || s.studentEmail || "").trim().toLowerCase();
  if (existing.endsWith("@concept.edu.pk")) return existing;
  if (s.studentId) return buildParentPortalEmail(s.studentName, s.studentId);
  return existing;
}

function studentPhoneOf(s: AcademyStudent): string {
  return String(s.phone || (s as { mobileNo?: string }).mobileNo || s.contactPhoneRes || "").trim();
}

function studentLabel(s: AcademyStudent): string {
  const id = s.rollNumber || s.registrationNumber || s.studentId || "—";
  return `${s.studentName} · ${id}`;
}

function defaultActionsForModule(mod: ModuleRegistryEntry): string[] {
  const seeded = PARENT_DEFAULT_MODULE_PERMISSIONS[mod.key];
  if (seeded?.length) return [...seeded];
  if (mod.actions.includes("view")) return ["view"];
  return mod.actions.slice(0, 1);
}

export function emptyParentCreateSelection(): ParentCreateSelection {
  return {
    studentId: null,
    name: "",
    email: "",
    phone: "",
    password: "Concept@1234",
    modulePermissions: { ...PARENT_DEFAULT_MODULE_PERMISSIONS },
  };
}

export default function ParentUserCreateFields({
  value,
  onChange,
  modules,
}: {
  value: ParentCreateSelection;
  onChange: (next: ParentCreateSelection) => void;
  modules: ModuleRegistryEntry[];
}) {
  const [sessionId, setSessionId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["parent-create-sessions"],
    queryFn: () => fetchSessions(),
  });

  useEffect(() => {
    if (sessionId || !sessions.length) return;
    const active =
      sessions.find((s) => s.isActive && isSessionWritable(s)) ||
      sessions.find((s) => isSessionWritable(s)) ||
      sessions[0];
    if (active) setSessionId(active._id);
  }, [sessions, sessionId]);

  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ["parent-create-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId }),
    enabled: Boolean(sessionId),
  });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["parent-create-sections", classId],
    queryFn: () => fetchSectionsByClass(classId, { status: "active" }),
    enabled: Boolean(classId),
  });

  const searchReady = Boolean(sessionId && classId && sectionId);

  const { data: studentsResult, isFetching: studentsLoading } = useQuery({
    queryKey: ["parent-create-students", sessionId, classId, sectionId, debouncedSearch],
    queryFn: () =>
      fetchAcademyStudents({
        page: 1,
        limit: 30,
        status: "active",
        sessionId,
        classId,
        sectionId,
        search: debouncedSearch || undefined,
      }),
    enabled: searchReady,
  });

  const students = studentsResult?.students ?? [];

  const selectedStudent = useMemo(
    () => students.find((s) => s._id === value.studentId) ?? null,
    [students, value.studentId],
  );

  const patch = (partial: Partial<ParentCreateSelection>) => onChange({ ...value, ...partial });

  const activeSessionName = sessions.find((s) => s._id === sessionId)?.name;

  const onClassChange = (id: string) => {
    setClassId(id);
    setSectionId("");
    setSearch("");
    setPickerOpen(false);
    onChange({
      ...emptyParentCreateSelection(),
      password: value.password,
      modulePermissions: value.modulePermissions,
    });
  };

  const onSectionChange = (id: string) => {
    setSectionId(id);
    setSearch("");
    setPickerOpen(false);
    onChange({
      ...emptyParentCreateSelection(),
      password: value.password,
      modulePermissions: value.modulePermissions,
    });
  };

  const selectStudent = (s: AcademyStudent) => {
    const email = studentEmailOf(s);
    const phone = studentPhoneOf(s);
    patch({
      studentId: s._id,
      name: s.studentName.trim(),
      email,
      phone,
      password: value.password || "Concept@1234",
      modulePermissions: Object.keys(value.modulePermissions || {}).length
        ? value.modulePermissions
        : { ...PARENT_DEFAULT_MODULE_PERMISSIONS },
    });
    setSearch(studentLabel(s));
    setPickerOpen(false);
  };

  const toggleModule = (mod: ModuleRegistryEntry, checked: boolean) => {
    const next = { ...value.modulePermissions };
    if (checked) next[mod.key] = defaultActionsForModule(mod);
    else delete next[mod.key];
    patch({ modulePermissions: next });
  };

  const selectClassName = "w-full h-10 rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

  return (
    <div className="col-span-2 space-y-4">
      <div className="space-y-3 rounded-lg border border-border bg-secondary/10 p-3">
        <div className="text-sm font-semibold text-primary">Academic information</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="mb-1.5 block">
              Academic session <span className="text-destructive">*</span>
            </Label>
            <Input
              value={sessionsLoading ? "Loading…" : activeSessionName || "No active session"}
              readOnly
              disabled
              title="Locked to the active academic session"
            />
          </div>
          <div>
            <Label className="mb-1.5 block">
              Class <span className="text-destructive">*</span>
            </Label>
            <select
              className={selectClassName}
              value={classId}
              onChange={(e) => onClassChange(e.target.value)}
              disabled={!sessionId || classesLoading}
            >
              <option value="">
                {!sessionId ? "Select session first" : classesLoading ? "Loading classes…" : "Select class…"}
              </option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.className}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">
              Section <span className="text-destructive">*</span>
            </Label>
            <select
              className={selectClassName}
              value={sectionId}
              onChange={(e) => onSectionChange(e.target.value)}
              disabled={!classId || sectionsLoading}
            >
              <option value="">
                {!classId ? "Select class first" : sectionsLoading ? "Loading sections…" : "Select section…"}
              </option>
              {sections.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.sectionName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative">
          <Label className="mb-1.5 block">
            Search student <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPickerOpen(true);
                if (value.studentId) {
                  patch({ studentId: null, name: "", email: "", phone: "" });
                }
              }}
              onFocus={() => searchReady && setPickerOpen(true)}
              disabled={!searchReady}
              placeholder={
                searchReady
                  ? "Search by Student Name, Registration ID, or Roll Number"
                  : "Select session, class, and section first"
              }
              className="pr-9"
            />
            {studentsLoading ? (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          {pickerOpen && searchReady && (
            <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-background shadow-md max-h-56 overflow-y-auto">
              {studentsLoading && students.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
              ) : students.length === 0 ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">No students found.</p>
              ) : (
                students.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-secondary/60 border-b border-border last:border-0"
                    onClick={() => selectStudent(s)}
                  >
                    <div className="font-medium">{s.studentName}</div>
                    <div className="text-xs text-muted-foreground">
                      {[s.rollNumber && `Roll ${s.rollNumber}`, s.registrationNumber && `Reg ${s.registrationNumber}`, studentEmailOf(s)]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-secondary/10 p-3">
        <div className="text-sm font-semibold text-primary">Student information</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="mb-1.5 block">Student name</Label>
            <Input value={value.name} readOnly disabled placeholder="Select a student" />
          </div>
          <div>
            <Label className="mb-1.5 block">Parent portal email</Label>
            <Input value={value.email} readOnly disabled placeholder="Select a student" />
          </div>
          <div>
            <Label className="mb-1.5 block">Student contact</Label>
            <Input value={value.phone} readOnly disabled placeholder="Select a student" />
          </div>
        </div>
        {value.studentId && !value.email ? (
          <p className="text-xs text-destructive">
            Could not build a portal email. Ensure the student has an official Student ID.
          </p>
        ) : null}
        {selectedStudent || value.studentId ? null : (
          <p className="text-xs text-muted-foreground">Select a student to auto-fill these fields.</p>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-secondary/10 p-3">
        <div className="text-sm font-semibold text-primary">Parent information</div>
        <div>
          <Label className="mb-1.5 block">
            Parent password <span className="text-destructive">*</span>
          </Label>
          <div className="relative max-w-md">
            <Input
              type="text"
              autoComplete="new-password"
              value={value.password}
              onChange={(e) => patch({ password: e.target.value })}
              placeholder="Concept@1234"
              className="font-mono"
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Password is shown in plain text: <span className="font-medium text-foreground font-mono">Concept@1234</span>
          </p>
        </div>
      </div>

      {modules.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
          <div>
            <div className="text-sm font-semibold text-primary">Module access</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Defaults are pre-selected. Add or remove modules as needed.
            </p>
          </div>
          <ScrollArea className="h-[min(280px,40vh)] pr-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {modules.map((mod) => {
                const checked = Boolean(value.modulePermissions[mod.key]?.length);
                return (
                  <label
                    key={mod.key}
                    className="flex items-start gap-2 rounded-md border border-border bg-background/80 p-3 cursor-pointer"
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={checked}
                      onCheckedChange={(v) => toggleModule(mod, v === true)}
                    />
                    <span>
                      <span className="block text-sm font-medium text-primary">{mod.name}</span>
                      {mod.description ? (
                        <span className="block text-[11px] text-muted-foreground leading-snug">{mod.description}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
