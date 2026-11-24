import { useEffect, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  fetchAcademyStudents,
  fetchClassTests,
  fetchStudentAssessments,
  fetchStudentMonthAttendance,
  fetchSubjectsByClass,
  getAcademyStudentRecord,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { fetchAssessmentDateSheet, fetchSessions, fetchSubjects } from "@/lib/configApi";
import { fetchStudentExamResults } from "@/lib/examApi";
import { fetchAnnouncements } from "@/lib/announcementApi";
import { fetchNotifications } from "@/lib/notificationsApi";
import { fetchAcademicCalendar } from "@/lib/academicCalendarApi";
import { fetchSectionSchedule } from "@/lib/timetableApi";
import { localTodayYmd } from "@/lib/localDate";

/**
 * Offline-ready parent app: while online, download every parent screen's data for every child
 * into the saved query cache (persisted on the device by App.tsx), so screens the parent never
 * opened still work without internet.
 *
 * IMPORTANT: the query keys below must match the keys the parent screens use
 * (components/modules/parent/*, ParentDashboard, Panel). If a screen's key changes, update it here
 * too — otherwise that screen simply loads normally online and is empty offline until opened once.
 */

/** Don't re-download everything more often than this (screens refresh themselves anyway). */
const MIN_INTERVAL_MS = 10 * 60_000;
const LAST_SYNC_KEY = "parent-offline-sync-at";

function idOf(ref: unknown): string {
  if (!ref) return "";
  if (typeof ref === "string") return ref;
  if (typeof ref === "object" && ref !== null && "_id" in ref) {
    return String((ref as { _id: string })._id || "");
  }
  return "";
}

/** Run a download and copy the result into each screen's cache key; failures are ignored. */
async function fill<T>(qc: QueryClient, keys: readonly (readonly unknown[])[], load: () => Promise<T>) {
  try {
    const data = await load();
    keys.forEach((key) => qc.setQueryData(key as unknown[], data));
    return data;
  } catch {
    return undefined;
  }
}

async function syncParentData(
  qc: QueryClient,
  userId: string,
  panelSessionId: string | undefined,
) {
  const children = await fill(
    qc,
    [
      ["parent-children-banner", userId],
      ["parent-children-attendance", userId],
      ["parent-children-academics", userId],
      ["parent-children-date-sheet", userId],
      ["parent-children-profile", userId],
      ["parent-children-report-cards", userId],
      ["parent-children-exams", userId],
      ["parent-dashboard-children", userId],
      ["dashboard-parent-children"],
      ...(panelSessionId ? [["parent-children-schedule", panelSessionId, userId]] : []),
    ],
    async () => (await fetchAcademyStudents({ limit: 100 })).students as AcademyStudent[],
  );
  if (!children?.length) return;

  // Shared (not per child).
  const [sessions] = await Promise.all([
    fill(qc, [["academic-sessions", "parent-date-sheet"], ["academic-sessions", "parent-exams"]], () =>
      fetchSessions(),
    ),
    fill(qc, [["announcements", "parent-mobile"]], () => fetchAnnouncements()),
    fill(qc, [["parent-dashboard-announcements"]], () => fetchAnnouncements({ audience: "parents" })),
    fill(
      qc,
      [["notifications-inbox", false], ...children.map((c) => ["parent-mobile-alert-count", userId, c._id])],
      () => fetchNotifications({ limit: 80 }),
    ),
    fill(qc, [["parent-dashboard-notifications"]], () => fetchNotifications({ limit: 8 })),
    fill(qc, [["config-subjects", "all"]], () => fetchSubjects()),
  ]);

  const [year, month] = localTodayYmd().split("-").map(Number);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  // One child at a time so a parent with several children doesn't flood the server.
  for (const child of children) {
    const id = child._id;
    const classId = idOf(child.classId);
    const sectionId = idOf(child.sectionId);
    const classSessionId =
      child.classId && typeof child.classId === "object"
        ? idOf((child.classId as { sessionId?: unknown }).sessionId)
        : "";
    const sheetSessionId =
      classSessionId ||
      sessions?.find((s) => s.isActive || s.status === "active")?._id ||
      sessions?.[0]?._id ||
      "";

    await Promise.all([
      fill(
        qc,
        [
          ["parent-dashboard-record", id],
          ["parent-academics-record", id],
          ["parent-mobile-calendar-record", id],
          ["parent-attendance-student-record", id],
        ],
        () => getAcademyStudentRecord(id),
      ),
      fill(qc, [["parent-attendance-month", id, month, year]], () =>
        fetchStudentMonthAttendance({ studentId: id, month, year }),
      ),
      fill(qc, [["parent-attendance-month", id, prevMonth, prevYear]], () =>
        fetchStudentMonthAttendance({ studentId: id, month: prevMonth, year: prevYear }),
      ),
      fill(qc, [["parent-exam-results", id], ["parent-exam-results-date-sheet", id]], () =>
        fetchStudentExamResults(id),
      ),
      fill(qc, [["parent-assessments", id]], () => fetchStudentAssessments(id)),
      classId
        ? fill(
            qc,
            [["parent-class-tests-date-sheet", classId], ["parent-upcoming-class-tests-exams", classId]],
            () => fetchClassTests(classId),
          )
        : null,
      classId
        ? fill(qc, [["parent-academics-class-subjects", classId]], () =>
            fetchSubjectsByClass(classId, { status: "active" }),
          )
        : null,
      classId && sheetSessionId
        ? fill(qc, [["parent-date-sheet", sheetSessionId, classId, sectionId]], () =>
            fetchAssessmentDateSheet(sheetSessionId, {
              classId,
              sectionId: sectionId || undefined,
            }),
          )
        : null,
      fill(
        qc,
        [
          ["parent-mobile-calendar", panelSessionId || "", classId, sectionId],
          ["parent-academics-calendar", panelSessionId || "", classId, sectionId],
        ],
        () =>
          fetchAcademicCalendar({
            sessionId: panelSessionId,
            classId: classId || undefined,
            sectionId: sectionId || undefined,
          }),
      ),
      panelSessionId && sectionId
        ? fill(qc, [["parent-section-schedule", panelSessionId, sectionId]], () =>
            fetchSectionSchedule(panelSessionId, sectionId),
          )
        : null,
    ]);
  }
}

/** Mounted once inside the parent panel; renders nothing. */
export default function ParentOfflineSync({
  userId,
  panelSessionId,
}: {
  userId: string;
  /** The panel's selected academic session (undefined for "All sessions"). */
  panelSessionId?: string;
}) {
  const qc = useQueryClient();
  const running = useRef(false);

  useEffect(() => {
    const storageKey = `${LAST_SYNC_KEY}:${userId}`;

    const run = async (force: boolean) => {
      if (running.current || !navigator.onLine) return;
      if (!force) {
        try {
          const last = Number(localStorage.getItem(storageKey) || 0);
          if (Date.now() - last < MIN_INTERVAL_MS) return;
        } catch {
          /* storage unavailable: just sync */
        }
      }
      running.current = true;
      try {
        await syncParentData(qc, userId, panelSessionId);
        try {
          localStorage.setItem(storageKey, String(Date.now()));
        } catch {
          /* ignore */
        }
      } finally {
        running.current = false;
      }
    };

    // Let the visible screen load first, then fill in the rest in the background.
    const timer = window.setTimeout(() => void run(false), 3000);
    const onOnline = () => void run(true);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [qc, userId, panelSessionId]);

  return null;
}
