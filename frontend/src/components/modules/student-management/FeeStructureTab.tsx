import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, WalletCards } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import AdditionalChargesPanel from "./AdditionalChargesPanel";
import {
  createFeeStructure,
  fetchAcademyClasses,
  fetchAllFeeStructures,
  updateFeeStructure,
  type AcademyClass,
  type AcademyFeeStructure,
} from "@/lib/studentManagementApi";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import ClassProgramSelect from "@/components/modules/ClassProgramSelect";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { sessionLabelFromAcademyClass } from "./studentDisplayUtils";

const FEE_STRUCTURES_KEY = ["academy-fee-structures"] as const;

const emptyModalForm = () => ({
  classId: "",
  perSubjectFee: "",
  fullPackageFee: "",
  admissionFee: "",
});

function classLabel(classId: AcademyFeeStructure["classId"]): string {
  if (!classId) return "—";
  if (typeof classId === "string") return classId;
  return classId.className || "—";
}

function formatFee(n: number) {
  return `₨ ${n.toLocaleString()}`;
}

function resolveClassId(classId: AcademyFeeStructure["classId"]): string {
  if (!classId) return "";
  return typeof classId === "string" ? classId : classId._id || "";
}

export default function FeeStructureTab({ caps, sessionId }: { caps: ModuleActionCaps; sessionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<AcademyFeeStructure | null>(null);
  const [modalForm, setModalForm] = useState(emptyModalForm);
  const [search, setSearch] = useState("");
  const { apiSessionId, writable, hasScope, isAll } = useSessionScope(sessionId);

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: hasScope,
  });

  const classIds = useMemo(() => new Set(classes.map((c) => c._id)), [classes]);

  const { data: allStructures = [], isLoading: listLoading } = useQuery({
    queryKey: [...FEE_STRUCTURES_KEY, sessionId],
    queryFn: () => fetchAllFeeStructures(),
    enabled: hasScope,
  });

  const structuresForSession = useMemo(() => {
    if (isAll) return allStructures;
    return allStructures.filter((row) => classIds.has(resolveClassId(row.classId)));
  }, [allStructures, classIds, isAll]);

  const structuresFiltered = useMemo(() => {
    if (!search.trim()) return structuresForSession;
    return structuresForSession.filter((row) =>
      matchesPanelSearch(
        search,
        classLabel(row.classId),
        row.perSubjectFee,
        row.fullPackageFee,
        row.admissionFee,
        row.status,
        typeof row.classId === "object" ? sessionLabelFromAcademyClass(row.classId as AcademyClass) : ""
      )
    );
  }, [structuresForSession, search]);

  const openCreate = () => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to create fee structures.",
        variant: "destructive",
      });
      return;
    }
    setEditRow(null);
    setModalForm(emptyModalForm());
    setOpen(true);
  };

  const openEdit = (row: AcademyFeeStructure) => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to edit.",
        variant: "destructive",
      });
      return;
    }
    setEditRow(row);
    setModalForm({
      classId: resolveClassId(row.classId),
      perSubjectFee: String(row.perSubjectFee),
      fullPackageFee: String(row.fullPackageFee),
      admissionFee: String(row.admissionFee),
    });
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!writable) throw new Error("Switch to the active session to make changes.");
      const body = {
        perSubjectFee: Number(modalForm.perSubjectFee),
        fullPackageFee: Number(modalForm.fullPackageFee),
        admissionFee: Number(modalForm.admissionFee),
      };
      if (editRow?._id) return updateFeeStructure(editRow._id, body);
      return createFeeStructure({ classId: modalForm.classId, ...body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: FEE_STRUCTURES_KEY });
      setOpen(false);
      setEditRow(null);
      toast({ title: editRow ? "Fee structure updated" : "Fee structure created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const canSave = writable && (caps.canCreate || caps.canEdit);
  const selectedClass = classes.find((c) => c._id === modalForm.classId);
  const isEdit = Boolean(editRow);

  const formValid =
    modalForm.perSubjectFee !== ""
    && modalForm.fullPackageFee !== ""
    && modalForm.admissionFee !== ""
    && (isEdit || Boolean(modalForm.classId));

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {/* Compact theme header (same as Subjects) */}
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <WalletCards className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Fee Structure
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-md">
                Set per-subject, full package and admission fees for each class.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[14rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              Clear fees, confident families.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-b bg-muted/30">
          <h3 className="font-medium text-sm">
            {isAll ? "Fee structures (all sessions)" : "Fee structures"}
          </h3>
          <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
            <PanelSearchBar value={search} onChange={setSearch} placeholder="Search class or fees…" className="max-w-xs" />
            {caps.canCreate && writable && (
              <Button className="h-10 w-full gap-2 sm:w-auto sm:shrink-0" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Create fee structure
              </Button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left p-3 font-medium">Class</th>
                {isAll && <th className="text-left p-3 font-medium">Session</th>}
                <th className="text-left p-3 font-medium">Per subject</th>
                <th className="text-left p-3 font-medium">Full package</th>
                <th className="text-left p-3 font-medium">Admission</th>
                <th className="text-left p-3 font-medium">Status</th>
                {canSave && <th className="text-right p-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {listLoading && (
                <tr>
                  <td colSpan={canSave ? 6 + (isAll ? 1 : 0) : 5 + (isAll ? 1 : 0)} className="p-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!listLoading && structuresFiltered.length === 0 && (
                <tr>
                  <td colSpan={canSave ? 6 + (isAll ? 1 : 0) : 5 + (isAll ? 1 : 0)} className="p-8 text-center text-muted-foreground">
                    {search.trim()
                      ? "No fee structures match your search."
                      : "No fee structures yet."}
                  </td>
                </tr>
              )}
              {structuresFiltered.map((row) => (
                <tr key={row._id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium">{classLabel(row.classId)}</td>
                  {isAll && (
                    <td className="p-3 text-muted-foreground text-xs">
                      {typeof row.classId === "object"
                        ? sessionLabelFromAcademyClass(row.classId as AcademyClass) || "—"
                        : "—"}
                    </td>
                  )}
                  <td className="p-3">{formatFee(row.perSubjectFee)}</td>
                  <td className="p-3">{formatFee(row.fullPackageFee)}</td>
                  <td className="p-3">{formatFee(row.admissionFee)}</td>
                  <td className="p-3">
                    <span
                      className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                        row.status === "active"
                          ? "bg-accent/15 text-accent"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {row.status}
                    </span>
                  </td>
                  {canSave && (
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Edit fee structure"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AdditionalChargesPanel caps={caps} sessionId={sessionId} />

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditRow(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit fee structure" : "Create fee structure"}</DialogTitle>
            {selectedClass && (
              <p className="text-sm text-muted-foreground">
                {isEdit ? "Class: " : "For class: "}
                <span className="font-medium text-foreground">{selectedClass.className}</span>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!isEdit && (
              <ClassProgramSelect
                id="fee-modal-class"
                className="w-full"
                value={modalForm.classId}
                onChange={(v) => setModalForm((f) => ({ ...f, classId: v }))}
                classes={classes}
                emptyLabel="Select class…"
              />
            )}
            <div>
              <Label htmlFor="fee-per-subject">Per subject fee (₨)</Label>
              <Input
                id="fee-per-subject"
                type="number"
                min={0}
                value={modalForm.perSubjectFee}
                onChange={(e) => setModalForm((f) => ({ ...f, perSubjectFee: e.target.value }))}
                disabled={!canSave}
              />
            </div>
            <div>
              <Label htmlFor="fee-full-package">Full package fee (₨)</Label>
              <Input
                id="fee-full-package"
                type="number"
                min={0}
                value={modalForm.fullPackageFee}
                onChange={(e) => setModalForm((f) => ({ ...f, fullPackageFee: e.target.value }))}
                disabled={!canSave}
              />
            </div>
            <div>
              <Label htmlFor="fee-admission">Admission fee (₨)</Label>
              <Input
                id="fee-admission"
                type="number"
                min={0}
                value={modalForm.admissionFee}
                onChange={(e) => setModalForm((f) => ({ ...f, admissionFee: e.target.value }))}
                disabled={!canSave}
              />
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-medium text-primary">Example (3 subjects)</p>
              <p>Monthly = 3 × per subject fee</p>
              <p>First payment = monthly + admission fee</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {canSave && (
              <Button disabled={saveMut.isPending || !formValid} onClick={() => saveMut.mutate()}>
                {saveMut.isPending ? "Saving…" : isEdit ? "Save changes" : "Create"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
