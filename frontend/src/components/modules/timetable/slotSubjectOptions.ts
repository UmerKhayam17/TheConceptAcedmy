import type { SchoolSubject } from "@/lib/configApi";
import { isDeletedSubject, scheduleSlotEntries, type ScheduleSlot } from "@/lib/timetableApi";

/** Admission choice groups appear as one option; timetable-only combines are built in the dialog. */
export type SlotSubjectOption =
  | { key: string; kind: "single"; label: string; subjectIds: [string] }
  | { key: string; kind: "choice"; label: string; groupName: string; subjectIds: string[] };

export function buildSlotSubjectOptions(subjects: SchoolSubject[]): SlotSubjectOption[] {
  const byGroup = new Map<string, SchoolSubject[]>();
  const singles: SchoolSubject[] = [];

  for (const s of subjects) {
    if (!s?._id) continue;
    const groupName = s.choiceGroupName?.trim();
    if (s.enrollmentType === "choice" && groupName) {
      const key = groupName.toLowerCase();
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(s);
    } else {
      singles.push(s);
    }
  }

  const options: SlotSubjectOption[] = [];
  for (const group of byGroup.values()) {
    const sorted = [...group].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    if (sorted.length >= 2) {
      const groupName = sorted[0].choiceGroupName!.trim();
      options.push({
        key: `choice:${groupName.toLowerCase()}`,
        kind: "choice",
        groupName,
        subjectIds: sorted.map((s) => s._id),
        label: sorted.map((s) => s.name || "Untitled").join(" / "),
      });
    } else {
      singles.push(...sorted);
    }
  }
  for (const s of singles) {
    options.push({
      key: s._id,
      kind: "single",
      subjectIds: [s._id],
      label: s.name || "Untitled",
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function slotEntrySubjectIds(slot: ScheduleSlot | undefined): string[] {
  if (!slot) return [];
  return scheduleSlotEntries(slot)
    .map((e) => e.subject)
    .filter((s): s is NonNullable<typeof s> => Boolean(s) && !isDeletedSubject(s))
    .map((s) => s._id)
    .filter((id): id is string => Boolean(id));
}

export function optionKeyForSlot(
  slot: ScheduleSlot | undefined,
  options: SlotSubjectOption[]
): string {
  const entryIds = slotEntrySubjectIds(slot);
  if (entryIds.length > 1) {
    const match = options.find(
      (o) =>
        o.kind === "choice" &&
        o.subjectIds.length === entryIds.length &&
        o.subjectIds.every((id) => entryIds.includes(id))
    );
    if (match) return match.key;
    return "";
  }
  const subjectId = entryIds[0];
  if (!subjectId) return "";
  return options.find((o) => o.kind === "single" && o.subjectIds[0] === subjectId)?.key || subjectId;
}

/** True when the slot has multiple subjects that are not an admission choice group. */
export function isTimetableOnlyCombine(
  slot: ScheduleSlot | undefined,
  options: SlotSubjectOption[]
): boolean {
  const entryIds = slotEntrySubjectIds(slot);
  if (entryIds.length < 2) return false;
  return !options.some(
    (o) =>
      o.kind === "choice" &&
      o.subjectIds.length === entryIds.length &&
      o.subjectIds.every((id) => entryIds.includes(id))
  );
}
