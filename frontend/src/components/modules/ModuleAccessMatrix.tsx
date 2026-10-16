import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calendar,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Library,
  MessageSquare,
  Settings,
  Users,
  Wallet,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ModuleRegistryEntry } from "@/lib/staffApi";
import { cn } from "@/lib/utils";

const GROUP_LABELS: Record<string, string> = {
  "academic-setup": "Academic Setup",
  "student-management": "Student Management",
  "teacher-management": "Teacher Management",
  examinations: "Examination",
  teaching: "Teaching",
  finance: "Finance",
  communication: "Communication",
  reports: "Reports",
  administration: "Administration",
};

const MODULE_ICONS: Record<string, LucideIcon> = {
  student: Users,
  studentManagement: GraduationCap,
  myClasses: BookOpen,
  mySubjects: BookOpen,
  timetable: Calendar,
  homework: ClipboardList,
  studyMaterials: Library,
  lessonPlans: BookOpen,
  exam: ClipboardList,
  fee: Wallet,
  salary: Wallet,
  academyExpense: Wallet,
  chat: MessageSquare,
  announcement: MessageSquare,
  library: Library,
  schoolCalendar: Calendar,
  attendance: ClipboardList,
  staffAttendance: ClipboardList,
  reports: LayoutDashboard,
  profile: Users,
  leave: Calendar,
  notifications: MessageSquare,
  datasheets: ClipboardList,
  behaviour: Users,
  parentMeetings: Users,
  onlineClasses: BookOpen,
  studentProgress: GraduationCap,
};

function moduleIcon(key: string): LucideIcon {
  return MODULE_ICONS[key] || Settings;
}

function allActionsSelected(mod: ModuleRegistryEntry, value: Record<string, string[]>): boolean {
  const cur = value[mod.key] || [];
  return mod.actions.length > 0 && mod.actions.every((a) => cur.includes(a));
}

function anyActionSelected(mod: ModuleRegistryEntry, value: Record<string, string[]>): boolean {
  const cur = value[mod.key] || [];
  return mod.actions.some((a) => cur.includes(a));
}

function groupModules(
  modules: ModuleRegistryEntry[],
): { id: string; label: string; modules: ModuleRegistryEntry[] }[] {
  const order: string[] = [];
  const map = new Map<string, ModuleRegistryEntry[]>();
  modules.forEach((mod) => {
    const id = mod.parentGroup || "other";
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
    }
    map.get(id)!.push(mod);
  });
  return order.map((id) => ({
    id,
    label: GROUP_LABELS[id] || (id === "other" ? "Other" : id),
    modules: map.get(id) || [],
  }));
}

export default function ModuleAccessMatrix({
  modules,
  value,
  onChange,
  embedded = false,
  className,
}: {
  modules: ModuleRegistryEntry[];
  value: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  /** Hide the inner title when the parent card already labels the section. */
  embedded?: boolean;
  className?: string;
}) {
  const groups = groupModules(modules);

  const toggle = (modKey: string, action: string, checked: boolean) => {
    const next = { ...value };
    const cur = new Set(next[modKey] || []);
    if (checked) cur.add(action);
    else cur.delete(action);
    const arr = [...cur].sort();
    if (arr.length === 0) delete next[modKey];
    else next[modKey] = arr;
    onChange(next);
  };

  const selectAllForModule = (mod: ModuleRegistryEntry, checked: boolean) => {
    const next = { ...value };
    if (checked) next[mod.key] = [...mod.actions].sort();
    else delete next[mod.key];
    onChange(next);
  };

  const selectAllForGroup = (groupMods: ModuleRegistryEntry[], checked: boolean) => {
    const next = { ...value };
    groupMods.forEach((mod) => {
      if (checked && mod.actions.length > 0) next[mod.key] = [...mod.actions].sort();
      else delete next[mod.key];
    });
    onChange(next);
  };

  const allSelected =
    modules.length > 0 && modules.every((mod) => allActionsSelected(mod, value));

  const selectAllPermissions = () => {
    const next: Record<string, string[]> = {};
    modules.forEach((mod) => {
      if (mod.actions.length > 0) next[mod.key] = [...mod.actions].sort();
    });
    onChange(next);
  };

  const clearAllPermissions = () => onChange({});

  return (
    <div className={cn(embedded ? "space-y-3" : "space-y-3 rounded-lg border border-border bg-secondary/20 p-3", className)}>
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-semibold text-primary">Module permissions</div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
              onClick={selectAllPermissions}
              disabled={allSelected || modules.length === 0}
            >
              Select all
            </button>
            <button
              type="button"
              className="font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
              onClick={clearAllPermissions}
              disabled={Object.keys(value).length === 0}
            >
              Clear all
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-3 text-xs">
          <button
            type="button"
            className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
            onClick={selectAllPermissions}
            disabled={allSelected || modules.length === 0}
          >
            Select all
          </button>
          <button
            type="button"
            className="font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            onClick={clearAllPermissions}
            disabled={Object.keys(value).length === 0}
          >
            Clear all
          </button>
        </div>
      )}
      <ScrollArea className={cn(embedded ? "h-[min(560px,62vh)] pr-3" : "h-[min(420px,55vh)] pr-3")}>
        <div className="space-y-5">
          {groups.map((group) => {
            const groupAll =
              group.modules.length > 0 &&
              group.modules.every((mod) => allActionsSelected(mod, value));
            const groupSome =
              !groupAll && group.modules.some((mod) => anyActionSelected(mod, value));
            return (
              <div key={group.id} className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                    <Checkbox
                      checked={groupAll ? true : groupSome ? "indeterminate" : false}
                      onCheckedChange={(v) => selectAllForGroup(group.modules, v === true)}
                    />
                    <span>Select all</span>
                  </label>
                </div>
                <div className="space-y-2.5">
                  {group.modules.map((mod) => {
                    const moduleAll = allActionsSelected(mod, value);
                    const moduleSome = !moduleAll && anyActionSelected(mod, value);
                    const Icon = moduleIcon(mod.key);
                    return (
                      <div
                        key={mod.key}
                        className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-sm"
                      >
                        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                              <Icon className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-sm text-[#1a2b4b]">{mod.name}</div>
                              {mod.description ? (
                                <p className="mt-0.5 text-xs text-slate-500 leading-snug">
                                  {mod.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer shrink-0">
                            <Checkbox
                              checked={moduleAll ? true : moduleSome ? "indeterminate" : false}
                              onCheckedChange={(v) => selectAllForModule(mod, v === true)}
                            />
                            <span>Select all</span>
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-2 pl-12">
                          {mod.actions.map((action) => {
                            const checked = Boolean(value[mod.key]?.includes(action));
                            return (
                              <label
                                key={action}
                                className="flex items-center gap-2 text-sm cursor-pointer"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => toggle(mod.key, action, v === true)}
                                />
                                <span className="capitalize text-slate-700">{action}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
