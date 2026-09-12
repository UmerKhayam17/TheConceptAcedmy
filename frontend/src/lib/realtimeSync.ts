/** Maps backend module:sync events to React Query keys to invalidate. */
export interface ModuleSyncEvent {
  module: string;
  resource: string;
  action: string;
  id?: string;
  at?: number;
  status?: string;
}

const RESOURCE_KEYS: Record<string, string[][]> = {
  students: [
    ["academy-students"],
    ["academy-student"],
    ["academy-student-record"],
  ],
  classes: [["academy-classes"], ["academy-class"], ["academy-class-record"]],
  sections: [["academy-sections"]],
  subjects: [["academy-subjects"], ["enrollment-subjects"]],
  feeStructures: [["academy-fee-structures"], ["fee-preview"]],
  fees: [["academy-fees"], ["academy-fees-summary"], ["academy-fee-summary"], ["fee-defaulters"]],
  salaries: [["academy-salaries"], ["academy-salary-summary"]],
  expenses: [["academy-expenses"], ["academy-expense-summary"]],
  attendance: [
    ["academy-attendance"],
    ["academy-attendance-day"],
    ["academy-attendance-summary"],
    ["academy-attendance-today-dashboard"],
    ["staff-attendance-day"],
    ["staff-attendance-mine"],
  ],
  assessments: [["academy-assessments"], ["academy-student-record"]],
  classTests: [["academy-class-tests"], ["class-tests"], ["class-test-marks"]],
  timetable: [
    ["academy-timetable"],
    ["timetable-grid"],
    ["my-schedule"],
    ["my-teacher-schedule"],
  ],
  announcements: [["announcements"]],
  users: [["staff"], ["allUsers"], ["staffRoles"], ["moduleRegistry"], ["permissionCatalog"]],
};

const MODULE_FALLBACK: Record<string, string[][]> = {
  studentManagement: [["academy-classes"], ["academy-students"], ["academy-sections"], ["academy-subjects"]],
  student: [["academy-students"], ["academy-student"]],
  fee: [["academy-fees"], ["academy-fees-summary"]],
  salary: [["academy-salaries"]],
  academyExpense: [["academy-expenses"]],
  attendance: [["academy-attendance"], ["academy-attendance-day"], ["staff-attendance-day"]],
  exam: [["academy-assessments"], ["academy-class-tests"], ["class-tests"]],
  timetable: [["timetable-sessions"], ["timetable-grid"], ["my-teacher-schedule"]],
  announcement: [["announcements"]],
  user: [["staff"], ["allUsers"]],
  config: [["sessions"], ["config-classes"]],
};

export function queryKeysForModuleSync(event: ModuleSyncEvent): string[][] {
  const keys = new Set<string>();
  const add = (pairs: string[][]) => {
    pairs.forEach((p) => keys.add(JSON.stringify(p)));
  };

  if (event.resource && RESOURCE_KEYS[event.resource]) {
    add(RESOURCE_KEYS[event.resource]);
  }
  if (event.module && MODULE_FALLBACK[event.module]) {
    add(MODULE_FALLBACK[event.module]);
  }

  if (event.resource === "students" && event.id) {
    add([["academy-student", event.id], ["academy-student-record", event.id]]);
  }

  return [...keys].map((k) => JSON.parse(k) as string[]);
}
