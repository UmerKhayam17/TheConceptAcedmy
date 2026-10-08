import type { TeacherProfile } from "@/lib/timetableApi";

export type RosterTeacher = { _id: string; name: string; email?: string };

/** Active teacher profiles for the current session — the timetable roster. */
export function activeTeacherProfiles(profiles: TeacherProfile[]) {
  return profiles.filter((p) => p.isActive !== false && p.user?._id);
}

export function rosterTeachers(profiles: TeacherProfile[]): RosterTeacher[] {
  return activeTeacherProfiles(profiles)
    .map((p) => ({ _id: p.user._id, name: p.user.name, email: p.user.email }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Profile subject list is capability (Math, Physics), not a class/section assignment. */
export function profileCoversSubject(
  profile: TeacherProfile,
  subject?: { _id?: string; name?: string } | null,
) {
  if (!profile.subjects?.length || !subject) return false;
  const name = (subject.name || "").trim().toLowerCase();
  return profile.subjects.some((s) => {
    if (subject._id && s._id === subject._id) return true;
    const subjectName = (s.name || "").trim().toLowerCase();
    return Boolean(name && subjectName && subjectName === name);
  });
}

/**
 * Session roster, with teachers who can teach this subject listed first.
 * Everyone on the roster stays selectable — one profile covers many subjects.
 */
export function orderRosterForSubject(
  profiles: TeacherProfile[],
  subject?: { _id?: string; name?: string; teacher?: { _id: string } | null } | null,
): RosterTeacher[] {
  const roster = rosterTeachers(profiles);
  if (!subject) return roster;
  const byUser = new Map(activeTeacherProfiles(profiles).map((p) => [p.user._id, p]));
  const suggested: RosterTeacher[] = [];
  const rest: RosterTeacher[] = [];
  for (const teacher of roster) {
    const profile = byUser.get(teacher._id);
    const covers = profile ? profileCoversSubject(profile, subject) : false;
    const assigned = subject.teacher?._id === teacher._id;
    if (covers || assigned) suggested.push(teacher);
    else rest.push(teacher);
  }
  return [...suggested, ...rest];
}
