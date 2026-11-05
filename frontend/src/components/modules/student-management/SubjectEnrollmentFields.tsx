import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import type {
  AcademySubject,
  AcademySubjectChoiceGroup,
} from "@/lib/studentManagementApi";
import {
  generateSubjectCode,
  subjectCodePlaceholder,
} from "@/components/modules/student-management/subjectCodeUtils";
import type { GroupSubjectRow } from "@/components/modules/student-management/groupSubjectFormUtils";

export type SubjectEnrollmentForm = {
  enrollmentType: "required" | "choice";
  /** Selected virtual group key (group name); empty = create/join by typed name */
  choiceGroupId: string;
  choiceGroupName: string;
  pickCount: string;
  groupSubjectCount: string;
};

export const defaultSubjectEnrollmentForm = (): SubjectEnrollmentForm => ({
  enrollmentType: "required",
  choiceGroupId: "",
  choiceGroupName: "",
  pickCount: "1",
  groupSubjectCount: "2",
});

export function isGroupChoiceSubject(form: SubjectEnrollmentForm): boolean {
  return form.enrollmentType === "choice";
}

/** New choice group with multiple subjects (create dialog). */
export function isBulkGroupCreate(form: SubjectEnrollmentForm, isEdit: boolean): boolean {
  return !isEdit && form.enrollmentType === "choice" && !form.choiceGroupId;
}

/** Converting/editing into a brand-new choice group (need sibling subject names). */
export function isEditNewChoiceGroup(form: SubjectEnrollmentForm, isEdit: boolean): boolean {
  return Boolean(isEdit) && form.enrollmentType === "choice" && !form.choiceGroupId;
}

/** Show “how many subjects” + multi-name rows. */
export function needsGroupSubjectCount(form: SubjectEnrollmentForm, isEdit: boolean): boolean {
  return isBulkGroupCreate(form, isEdit) || isEditNewChoiceGroup(form, isEdit);
}

export function setGroupChoiceEnabled(
  form: SubjectEnrollmentForm,
  enabled: boolean,
): SubjectEnrollmentForm {
  if (!enabled) {
    return defaultSubjectEnrollmentForm();
  }
  return { ...form, enrollmentType: "choice", groupSubjectCount: form.groupSubjectCount || "2" };
}

export function subjectIdsOfGroup(group: AcademySubjectChoiceGroup): string[] {
  return (group.subjectIds || []).map((s) => (typeof s === "string" ? s : s._id));
}

export function findGroupForSubject(
  groups: AcademySubjectChoiceGroup[],
  subjectId: string,
): AcademySubjectChoiceGroup | undefined {
  return groups.find((g) => subjectIdsOfGroup(g).includes(subjectId));
}

export function enrollmentFromGroup(group: AcademySubjectChoiceGroup): SubjectEnrollmentForm {
  return {
    enrollmentType: "choice",
    choiceGroupId: group._id,
    choiceGroupName: group.groupName,
    pickCount: String(group.pickCount ?? 1),
    groupSubjectCount: String(group.subjectIds?.length ?? 2),
  };
}

/** Prefer fields stored on the subject; fall back to derived group list. */
export function enrollmentFromSubject(
  subject: AcademySubject,
  groups: AcademySubjectChoiceGroup[] = [],
): SubjectEnrollmentForm {
  if (subject.enrollmentType === "choice" && subject.choiceGroupName) {
    const group =
      findGroupForSubject(groups, subject._id) ||
      groups.find(
        (g) => g.groupName.toLowerCase() === subject.choiceGroupName!.trim().toLowerCase(),
      );
    return {
      enrollmentType: "choice",
      choiceGroupId: group?._id ?? subject.choiceGroupName,
      choiceGroupName: subject.choiceGroupName,
      pickCount: String(subject.pickCount ?? group?.pickCount ?? 1),
      groupSubjectCount: String(group?.subjectIds?.length ?? 2),
    };
  }
  const group = findGroupForSubject(groups, subject._id);
  return group ? enrollmentFromGroup(group) : defaultSubjectEnrollmentForm();
}

export function buildEnrollmentPayload(form: SubjectEnrollmentForm) {
  if (form.enrollmentType === "required") {
    return { enrollmentType: "required" as const };
  }
  const pickCount = Math.max(1, Number(form.pickCount) || 1);
  const choiceGroupName = (form.choiceGroupName || form.choiceGroupId).trim();
  return {
    enrollmentType: "choice" as const,
    choiceGroupName,
    pickCount,
  };
}

export function choiceGroupValid(form: SubjectEnrollmentForm): boolean {
  if (form.enrollmentType === "required") return true;
  return Boolean(form.choiceGroupId || form.choiceGroupName.trim());
}

type EnrollmentConfigProps = {
  value: SubjectEnrollmentForm;
  onChange: (next: SubjectEnrollmentForm) => void;
  choiceGroups: AcademySubjectChoiceGroup[];
  currentSubjectId?: string;
  isEdit?: boolean;
};

export function SubjectEnrollmentConfig({
  value,
  onChange,
  choiceGroups,
  currentSubjectId,
  isEdit,
}: EnrollmentConfigProps) {
  const isGroupChoice = isGroupChoiceSubject(value);
  const bulkCreate = isBulkGroupCreate(value, Boolean(isEdit));
  const editNewGroup = isEditNewChoiceGroup(value, Boolean(isEdit));
  const showSubjectCount = needsGroupSubjectCount(value, Boolean(isEdit));
  const patch = (partial: Partial<SubjectEnrollmentForm>) => onChange({ ...value, ...partial });

  const selectedGroup = choiceGroups.find((g) => g._id === value.choiceGroupId);

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 rounded-md border bg-muted/20 p-3 cursor-pointer">
        <Checkbox
          checked={isGroupChoice}
          onCheckedChange={(checked) => onChange(setGroupChoiceEnabled(value, checked === true))}
          className="mt-0.5"
          disabled={Boolean(isEdit && isGroupChoice && value.choiceGroupId)}
        />
        <div>
          <span className="text-sm font-medium">Group choice subject</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Electives that share a group name — students pick from that set.
          </p>
        </div>
      </label>

      {isGroupChoice && (
        <div className="space-y-3 rounded-md border border-dashed p-3">
          {choiceGroups.length > 0 && !isEdit && (
            <div>
              <Label className="text-xs">Group</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={value.choiceGroupId || "__new__"}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id === "__new__") {
                    patch({
                      choiceGroupId: "",
                      choiceGroupName: "",
                      groupSubjectCount: value.groupSubjectCount || "2",
                    });
                  } else {
                    const group = choiceGroups.find((g) => g._id === id);
                    patch({
                      choiceGroupId: id,
                      choiceGroupName: group?.groupName ?? id,
                      pickCount: String(group?.pickCount ?? 1),
                    });
                  }
                }}
              >
                <option value="__new__">Create New Group With Multiple Subjects…</option>
                {choiceGroups.map((g) => (
                  <option key={g._id} value={g._id}>
                    Add one subject to: {g.groupName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showSubjectCount && (
            <div>
              <Label className="text-xs">How many subjects in this group?</Label>
              <Input
                className="mt-1 max-w-[6rem]"
                type="number"
                min={2}
                max={10}
                value={value.groupSubjectCount}
                onChange={(e) => patch({ groupSubjectCount: e.target.value })}
              />
              {editNewGroup && (
                <p className="text-xs text-muted-foreground mt-1">
                  Subject 1 is this subject — enter the other option(s) below.
                </p>
              )}
            </div>
          )}

          {!bulkCreate && choiceGroups.length > 0 && isEdit && (
            <div>
              <Label className="text-xs">Group</Label>
              <select
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={value.choiceGroupId || "__new__"}
                onChange={(e) => {
                  const id = e.target.value;
                  if (id === "__new__") {
                    patch({
                      choiceGroupId: "",
                      choiceGroupName: "",
                      groupSubjectCount: value.groupSubjectCount || "2",
                    });
                  } else {
                    const group = choiceGroups.find((g) => g._id === id);
                    patch({
                      choiceGroupId: id,
                      choiceGroupName: group?.groupName ?? id,
                      pickCount: String(group?.pickCount ?? 1),
                    });
                  }
                }}
              >
                <option value="__new__">Create New Group…</option>
                {choiceGroups.map((g) => (
                  <option key={g._id} value={g._id}>
                    {g.groupName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(bulkCreate || editNewGroup || !value.choiceGroupId) && (
            <div>
              <Label className="text-xs">Group name</Label>
              <Input
                className="mt-1"
                value={value.choiceGroupName}
                onChange={(e) => patch({ choiceGroupName: e.target.value })}
                placeholder="e.g. Computer or Biology"
                disabled={!bulkCreate && !editNewGroup && Boolean(value.choiceGroupId)}
              />
            </div>
          )}

          {value.choiceGroupId && !bulkCreate && !editNewGroup && (
            <div>
              <Label className="text-xs">Group name</Label>
              <Input className="mt-1" value={value.choiceGroupName} disabled />
            </div>
          )}

          <div>
            <Label className="text-xs">Students must pick</Label>
            <Input
              className="mt-1 max-w-[6rem]"
              type="number"
              min={1}
              max={showSubjectCount ? Number(value.groupSubjectCount) || 10 : 10}
              value={value.pickCount}
              onChange={(e) => patch({ pickCount: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              How many options from this group each student selects.
            </p>
          </div>

          {selectedGroup && !bulkCreate && !editNewGroup && (
            <p className="text-xs text-muted-foreground">
              Already in this group:{" "}
              {selectedGroup.subjectIds
                .map((s) => (typeof s === "string" ? s : s.subjectName))
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

type BulkRowsProps = {
  rows: GroupSubjectRow[];
  onChange: (rows: GroupSubjectRow[]) => void;
  className: string;
  /** 1-based label offset (e.g. 2 → “Subject 2”) */
  startIndex?: number;
  title?: string;
};

export function GroupSubjectRowsEditor({
  rows,
  onChange,
  className,
  startIndex = 1,
  title = "Subjects in this group",
}: BulkRowsProps) {
  const updateRow = (index: number, patch: Partial<GroupSubjectRow>) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">{title}</Label>
      {rows.map((row, index) => (
        <div key={index} className="rounded-md border p-3 space-y-2 bg-background">
          <p className="text-xs font-medium text-muted-foreground">Subject {startIndex + index}</p>
          <div>
            <Label className="text-xs">Subject name</Label>
            <Input
              className="mt-1"
              value={row.subjectName}
              onChange={(e) => {
                const subjectName = e.target.value;
                const next: Partial<GroupSubjectRow> = { subjectName };
                if (!row.codeManual) {
                  next.subjectCode = generateSubjectCode(subjectName, className);
                }
                updateRow(index, next);
              }}
              placeholder="e.g. Computer Science"
            />
          </div>
          <div>
            <Label className="text-xs">Subject code</Label>
            <Input
              className="mt-1"
              value={row.subjectCode}
              onChange={(e) =>
                updateRow(index, { subjectCode: e.target.value.toUpperCase(), codeManual: true })
              }
              placeholder={subjectCodePlaceholder(className)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default SubjectEnrollmentConfig;
