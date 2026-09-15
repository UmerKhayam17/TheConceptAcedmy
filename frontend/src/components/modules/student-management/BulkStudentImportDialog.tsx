import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  downloadStudentImportTemplate,
  fetchAcademyClasses,
  importAcademyStudents,
  type StudentImportResult,
} from "@/lib/studentManagementApi";

const EXCEL_COLUMNS = [
  { header: "Sr#", required: false, format: "Row number (ignored)", example: "1" },
  { header: "Reg No", required: false, format: "Kept if provided", example: "59" },
  { header: "Student Name", required: true, format: "Full name", example: "Ali Hassan" },
  { header: "Father Name", required: true, format: "Full name", example: "Muhammad Abbas" },
  { header: "Mobile", required: true, format: "03… or 3…; siblings may share a parent number", example: "3338734833" },
  { header: "Admission Class", required: false, format: "Stream (MED, ICS…) — blank is OK; new values are added to the class", example: "MED" },
  { header: "CLASS", required: true, format: "Must exist in this session (e.g. 12th)", example: "12th" },
  { header: "SECTION", required: true, format: "Created for that class if missing (e.g. A1)", example: "A1" },
  { header: "Subjects", required: false, format: "all = every subject; otherwise comma-separated names", example: "all" },
] as const;

export default function BulkStudentImportDialog({
  open,
  onOpenChange,
  sessionId = "",
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId?: string;
  onImported?: () => void;
}) {
  const { toast } = useToast();
  const [classId, setClassId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<StudentImportResult | null>(null);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: sessionId || undefined }),
    enabled: open && Boolean(sessionId),
  });

  useEffect(() => {
    if (!open) {
      setClassId("");
      setFile(null);
      setResult(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleDownloadTemplate = async () => {
    setDownloading(true);
    try {
      const blob = await downloadStudentImportTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "STUDENT DETAIL.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({
        title: "Template download failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleImport = async () => {
    if (!sessionId) {
      toast({ title: "Select an academic session first", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Choose an Excel or CSV file", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const data = await importAcademyStudents(file, sessionId, classId || undefined);
      setResult(data);
      if (data.createdCount > 0) {
        onImported?.();
        toast({
          title: `Imported ${data.createdCount} student${data.createdCount === 1 ? "" : "s"}`,
          description:
            data.failedCount > 0
              ? `${data.failedCount} row${data.failedCount === 1 ? "" : "s"} could not be imported.`
              : "Saved as active enrolled students.",
        });
      } else {
        toast({
          title: "No students imported",
          description: data.failed[0]?.error || "Check the file and try again.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl cms-portal font-sans" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Import students</DialogTitle>
          <DialogDescription>
            Import your current active register. Students are saved as Active (not pending fee).
            Missing sections and streams are created. Mobile may start with 03 or 3. SECTION is required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#217346] text-white text-sm font-medium">
              <FileSpreadsheet className="h-4 w-4" />
              Excel format · your register columns
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[720px] font-sans">
                <thead>
                  <tr className="bg-[#e7e6e6] text-[#595959]">
                    <th className="p-1.5 w-8 border border-[#d0d0d0] font-normal" />
                    {EXCEL_COLUMNS.map((col, i) => (
                      <th key={col.header} className="p-1.5 border border-[#d0d0d0] font-normal text-center w-[14%]">
                        {String.fromCharCode(65 + i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="p-1.5 border border-[#d0d0d0] bg-[#e7e6e6] text-[#595959] text-center">1</td>
                    {EXCEL_COLUMNS.map((col) => (
                      <td key={col.header} className="p-2 border border-[#d0d0d0] bg-[#0E2A4E] text-white font-semibold">
                        {col.header}
                        {col.required ? " *" : ""}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-1.5 border border-[#d0d0d0] bg-[#e7e6e6] text-[#595959] text-center">2</td>
                    {EXCEL_COLUMNS.map((col) => (
                      <td key={col.header} className="p-2 border border-[#d0d0d0] bg-background">
                        {col.header === "CLASS" && classes[0]?.className ? classes[0].className : col.example}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-3 pt-2 text-[11px] text-muted-foreground">
              Same columns as STUDENT DETAIL 2026, plus optional Subjects. Write all for every subject, or
              comma-separated names. Blank Subjects also means all. CLASS must already exist in this session
              {classes.length ? ` (e.g. ${classes.map((c) => c.className).slice(0, 4).join(", ")}${classes.length > 4 ? "…" : ""})` : ""}.
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 bg-muted/30 text-xs text-muted-foreground">
              {EXCEL_COLUMNS.map((col) => (
                <li key={col.header}>
                  <span className="font-medium text-foreground">{col.header}</span>
                  {col.required ? " (required)" : " (optional)"} — {col.format}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-import-class">Default class (optional)</Label>
            <select
              id="bulk-import-class"
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
            >
              <option value="">Use CLASS column in the file</option>
              {classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.className}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              If a row has no CLASS, this class is used. CLASS in the file must match this session.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bulk-import-file">Spreadsheet</Label>
            <Input
              id="bulk-import-file"
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
            {file && <p className="text-xs text-muted-foreground">{file.name}</p>}
          </div>

          <Button type="button" variant="outline" className="gap-2" onClick={() => void handleDownloadTemplate()} disabled={downloading}>
            <Download className="h-4 w-4" />
            {downloading ? "Downloading…" : "Download template"}
          </Button>

          {result && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <p>
                Imported <span className="font-semibold">{result.createdCount}</span>
                {result.failedCount > 0 ? (
                  <>
                    {" "}
                    · <span className="text-destructive font-semibold">{result.failedCount} failed</span>
                  </>
                ) : null}
              </p>
              {result.failed.length > 0 && (
                <ul className="max-h-40 overflow-auto space-y-1 text-xs text-destructive">
                  {result.failed.slice(0, 40).map((f) => (
                    <li key={`${f.row}-${f.error}`}>
                      Row {f.row}: {f.error}
                    </li>
                  ))}
                  {result.failed.length > 40 && <li>…and {result.failed.length - 40} more</li>}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="gap-2" disabled={!file || !sessionId || submitting} onClick={() => void handleImport()}>
            <Upload className="h-4 w-4" />
            {submitting ? "Importing…" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
