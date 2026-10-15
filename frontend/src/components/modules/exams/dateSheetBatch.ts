import type { DateSheetRow } from "@/lib/configApi";

export function formatDateSheetDate(value: string) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function normalizeLabel(value: string | undefined | null) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[#.]/g, " ")
    .replace(/\s+/g, " ");
}

/** Group peer subject papers into one test batch (e.g. Test No. 1). */
export function dateSheetBatchKey(row: DateSheetRow) {
  const title = normalizeLabel(row.testName);
  const numbered = title.match(/\btest\s*(?:no|number)?\s*(\d+)\b/);
  const batch =
    numbered ? `test-no-${numbered[1]}` : title || row.assignmentId || row.classTestId || row.examId;
  return [
    row.category,
    row.classId || row.className,
    row.sectionId || row.sectionName || "all",
    row.disciplineId || row.disciplineName || "all",
    row.assessmentType || "",
    batch,
  ].join("|");
}

export function testNumberLabel(testName: string) {
  const m = String(testName || "").match(/\b(?:test\s*(?:no|number)?\s*)?(\d+)\b/i);
  return m ? `Test ${m[1]}` : testName || "Assessment";
}

/** Stable route id for a paper (assignment preferred, then class test / exam). */
export function dateSheetPaperRouteId(row: DateSheetRow) {
  return String(row.assignmentId || row.classTestId || row.examId || "").trim();
}

export type DateSheetBatch = {
  key: string;
  title: string;
  testNumber: string;
  typeLabel: string;
  category: "test" | "exam";
  className: string;
  sectionName: string;
  disciplineName: string;
  papers: DateSheetRow[];
  subjectNames: string[];
  dateFrom: string;
  dateTo: string;
  totalMarks: number;
  assignmentIds: string[];
  /** First paper id used for `/date-sheet/batch/:id` navigation. */
  routeId: string;
};

export function buildDateSheetBatches(rows: DateSheetRow[]): DateSheetBatch[] {
  const map = new Map<string, DateSheetRow[]>();
  rows.forEach((row) => {
    const key = dateSheetBatchKey(row);
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  });

  return [...map.entries()]
    .map(([key, papers]) => {
      const sorted = [...papers].sort((a, b) => {
        const da = new Date(a.examDate || 0).getTime();
        const db = new Date(b.examDate || 0).getTime();
        if (da !== db) return da - db;
        return String(a.subjectName || "").localeCompare(String(b.subjectName || ""));
      });
      const first = sorted[0];
      const dates = sorted
        .map((p) => new Date(p.examDate || 0).getTime())
        .filter((t) => Number.isFinite(t) && t > 0);
      const dateFrom = dates.length
        ? sorted.find((p) => new Date(p.examDate || 0).getTime() === Math.min(...dates))?.examDate ||
        ""
        : first?.examDate || "";
      const dateTo = dates.length
        ? sorted.find((p) => new Date(p.examDate || 0).getTime() === Math.max(...dates))?.examDate ||
        ""
        : first?.examDate || "";
      const routeId =
        sorted.map(dateSheetPaperRouteId).find(Boolean) ||
        String(first?.assignmentId || first?.classTestId || first?.examId || key);

      return {
        key,
        title: first?.testName || "Assessment",
        testNumber: testNumberLabel(first?.testName || ""),
        typeLabel: first?.assessmentTypeLabel || first?.assessmentType || "",
        category: first?.category || "test",
        className: first?.className || "—",
        sectionName: first?.sectionName || "—",
        disciplineName: first?.disciplineName || "",
        papers: sorted,
        subjectNames: sorted.map((p) => p.subjectName).filter(Boolean),
        dateFrom,
        dateTo,
        totalMarks: sorted.reduce((sum, p) => sum + (Number(p.totalMarks) || 0), 0),
        assignmentIds: sorted.map((p) => String(p.assignmentId || "")).filter(Boolean),
        routeId,
      };
    })
    .sort((a, b) => new Date(b.dateFrom || 0).getTime() - new Date(a.dateFrom || 0).getTime());
}

export function findDateSheetBatchByPaperId(
  rows: DateSheetRow[],
  paperId: string
): DateSheetBatch | null {
  if (!paperId) return null;
  const seed = rows.find((r) => dateSheetPaperRouteId(r) === paperId);
  if (!seed) return null;
  const key = dateSheetBatchKey(seed);
  return buildDateSheetBatches(rows).find((b) => b.key === key) || null;
}

export function dateSheetPrintParams(sessionId: string, batch: DateSheetBatch) {
  const assignmentId = [...new Set(batch.assignmentIds.filter(Boolean))].join(",");
  const first = batch.papers[0];
  return {
    sessionId,
    params: {
      classId: first?.classId || undefined,
      sectionId: first?.sectionId || undefined,
      assignmentId: assignmentId || undefined,
      testName: batch.title || undefined,
    },
  };
}
