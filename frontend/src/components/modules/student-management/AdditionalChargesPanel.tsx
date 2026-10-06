import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  createAdditionalCharge,
  deleteAdditionalCharge,
  fetchAcademyClasses,
  fetchAcademySectionsBySession,
  fetchAcademyStudents,
  fetchAdditionalCharges,
  updateAdditionalCharge,
  type AdditionalCharge,
  type AdditionalChargeRef,
} from "@/lib/studentManagementApi";
import { useSessionScope } from "@/components/modules/timetable/SessionBar";
import { MONTH_NAMES } from "./studentDisplayUtils";

const CHARGES_KEY = ["additional-charges"] as const;

type Frequency = "every_month" | "selected_months";
type Applicability = "all" | "class" | "students";

type ChargeForm = {
  name: string;
  amount: string;
  frequency: Frequency;
  months: number[];
  applicability: Applicability;
  classIds: string[];
  sectionIds: string[];
  studentIds: string[];
  status: "active" | "inactive";
};

const emptyForm = (): ChargeForm => ({
  name: "",
  amount: "",
  frequency: "every_month",
  months: [],
  applicability: "all",
  classIds: [],
  sectionIds: [],
  studentIds: [],
  status: "active",
});

function refId(value: AdditionalChargeRef | string) {
  return typeof value === "string" ? value : value._id;
}

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function frequencyLabel(charge: AdditionalCharge) {
  if (charge.frequency === "every_month") return "Every month";
  const names = (charge.months || [])
    .map((month) => MONTH_NAMES[month - 1])
    .filter(Boolean);
  return names.length ? names.join(", ") : "Selected months";
}

function appliesLabel(charge: AdditionalCharge) {
  if (charge.applicability === "all") return "All students";
  if (charge.applicability === "students") {
    const count = charge.studentIds?.length || 0;
    return count === 1 ? "1 student" : `${count} students`;
  }
  const classes = (charge.classIds || [])
    .map((item) => (typeof item === "string" ? "" : item.className))
    .filter(Boolean);
  return classes.length ? classes.join(", ") : "Selected classes";
}

export default function AdditionalChargesPanel({
  caps,
  sessionId,
  fixedClassId,
  embedded = false,
  scope = "all",
  hideWhenEmpty = false,
}: {
  caps: ModuleActionCaps;
  sessionId?: string;
  /** When set, new charges are saved for this class and the list shows only that class. */
  fixedClassId?: string;
  embedded?: boolean;
  /** "class" with fixedClassId lists that class. "other" lists all-student and selected-student charges. */
  scope?: "all" | "other";
  hideWhenEmpty?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { apiSessionId, writable, hasScope } = useSessionScope(sessionId || "");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ChargeForm>(emptyForm);
  const [studentQuery, setStudentQuery] = useState("");

  const { data: charges = [], isLoading } = useQuery({
    queryKey: CHARGES_KEY,
    queryFn: fetchAdditionalCharges,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["academy-classes", sessionId, "charges"],
    queryFn: () => fetchAcademyClasses({ status: "active", sessionId: apiSessionId }),
    enabled: open && hasScope,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ["academy-sections", apiSessionId, "charges"],
    queryFn: () => fetchAcademySectionsBySession(apiSessionId, { status: "active" }),
    enabled: open && form.applicability === "class" && hasScope,
  });

  const { data: studentResult } = useQuery({
    queryKey: ["academy-students-charge-picker", apiSessionId, studentQuery],
    queryFn: () =>
      fetchAcademyStudents({
        search: studentQuery || undefined,
        status: "active",
        sessionId: apiSessionId,
        limit: 20,
      }),
    enabled: open && form.applicability === "students" && hasScope,
  });

  const visibleSections = useMemo(() => {
    if (!form.classIds.length) return sections;
    return sections.filter((section) => {
      const classId = typeof section.classId === "string" ? section.classId : section.classId?._id;
      return classId ? form.classIds.includes(classId) : false;
    });
  }, [sections, form.classIds]);

  const openCreate = () => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to add charges.",
        variant: "destructive",
      });
      return;
    }
    setEditId(null);
    setForm({
      ...emptyForm(),
      applicability: fixedClassId ? "class" : "all",
      classIds: fixedClassId ? [fixedClassId] : [],
    });
    setStudentQuery("");
    setOpen(true);
  };

  const openEdit = (charge: AdditionalCharge) => {
    if (!writable) {
      toast({
        title: "Read-only session",
        description: "Switch to the active session to edit charges.",
        variant: "destructive",
      });
      return;
    }
    setEditId(charge._id);
    setForm({
      name: charge.name,
      amount: String(charge.amount),
      frequency: charge.frequency,
      months: charge.months || [],
      applicability: charge.applicability,
      classIds: (charge.classIds || []).map(refId),
      sectionIds: (charge.sectionIds || []).map(refId),
      studentIds: (charge.studentIds || []).map(refId),
      status: charge.status,
    });
    setStudentQuery("");
    setOpen(true);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount);
      if (!form.name.trim()) throw new Error("Enter a charge name.");
      if (!Number.isFinite(amount) || amount < 0) throw new Error("Enter an amount of 0 or more.");
      if (form.frequency === "selected_months" && form.months.length === 0) {
        throw new Error("Select at least one month.");
      }
      if (form.applicability === "class" && form.classIds.length === 0) {
        throw new Error("Select at least one class.");
      }
      if (form.applicability === "students" && form.studentIds.length === 0) {
        throw new Error("Select at least one student.");
      }
      const body = {
        name: form.name.trim(),
        amount,
        frequency: form.frequency,
        months: form.frequency === "selected_months" ? form.months : [],
        applicability: form.applicability,
        classIds: form.applicability === "class" ? form.classIds : [],
        sectionIds: form.applicability === "class" ? form.sectionIds : [],
        studentIds: form.applicability === "students" ? form.studentIds : [],
        status: form.status,
      };
      if (editId) return updateAdditionalCharge(editId, body);
      return createAdditionalCharge(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHARGES_KEY });
      setOpen(false);
      toast({ title: editId ? "Charge updated" : "Charge saved" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAdditionalCharge(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHARGES_KEY });
      toast({ title: "Charge removed" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const visibleCharges = fixedClassId
    ? charges.filter(
        (charge) =>
          charge.applicability === "class"
          && (charge.classIds || []).some((item) => refId(item) === fixedClassId),
      )
    : scope === "other"
      ? charges.filter((charge) => charge.applicability !== "class")
      : charges;

  if (hideWhenEmpty && !isLoading && visibleCharges.length === 0) return null;

  const addButton = caps.canCreate ? (
    <Button
      type="button"
      variant={embedded ? "outline" : "default"}
      className={embedded ? "h-8 gap-1.5" : "h-9 gap-1.5 bg-[#1769E0] hover:bg-[#1458C4]"}
      onClick={openCreate}
    >
      <Plus className="h-4 w-4" />
      Add charge
    </Button>
  ) : null;

  return (
    <div className="space-y-3">
      {embedded ? (
        <div className="border-t">
          {isLoading && <p className="px-4 py-3 text-sm text-slate-500">Loading charges…</p>}
          {!isLoading && visibleCharges.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">No charges for this class yet.</p>
          )}
          <ul className="divide-y text-sm">
            {visibleCharges.map((charge) => (
              <li key={charge._id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div>
                  <p className="font-medium text-[#10244A]">{charge.name}</p>
                  <p className="text-xs text-slate-500">
                    {frequencyLabel(charge)}
                    {charge.status === "inactive" ? " · Inactive" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span>₨ {charge.amount.toLocaleString()}</span>
                  {caps.canEdit && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(charge)} aria-label={`Edit ${charge.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {caps.canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Remove charge "${charge.name}"? Past fee records stay unchanged.`)) {
                          deleteMut.mutate(charge._id);
                        }
                      }}
                      aria-label={`Remove ${charge.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {addButton && <div className="px-4 py-3">{addButton}</div>}
        </div>
      ) : (
      <Card className="overflow-hidden rounded-xl border-[#E6EEF8]">
        <div className="flex flex-col gap-2 border-b border-[#EEF2F7] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#10244A]">
              {scope === "other" ? "Other charges" : "Additional charges"}
            </h3>
            <p className="text-xs text-slate-500">
              {scope === "other"
                ? "Charges that apply to every student, or to selected students."
                : "Configure once. Monthly generation adds matching charges into that month’s single fee. Existing fee records are left as they are."}
            </p>
          </div>
          {addButton}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-[#F8FAFC] text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Charge</th>
                <th className="px-3 py-3">Amount</th>
                <th className="px-3 py-3">Frequency</th>
                <th className="px-3 py-3">Applies to</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Loading charges…
                  </td>
                </tr>
              )}
              {!isLoading && visibleCharges.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    {embedded ? "No charges for this class yet." : "No additional charges yet. Add transport, lab, or stationery here."}
                  </td>
                </tr>
              )}
              {visibleCharges.map((charge) => (
                <tr key={charge._id} className="border-b border-[#F1F5F9] last:border-0">
                  <td className="px-4 py-3 font-medium text-[#10244A]">{charge.name}</td>
                  <td className="px-3 py-3">Rs {charge.amount.toLocaleString()}</td>
                  <td className="px-3 py-3 text-slate-600">{frequencyLabel(charge)}</td>
                  <td className="px-3 py-3 text-slate-600">{appliesLabel(charge)}</td>
                  <td className="px-3 py-3 capitalize">{charge.status}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {caps.canEdit && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(charge)} aria-label={`Edit ${charge.name}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {caps.canDelete && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => {
                            if (confirm(`Remove charge "${charge.name}"? Past fee records stay unchanged.`)) {
                              deleteMut.mutate(charge._id);
                            }
                          }}
                          aria-label={`Remove ${charge.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit charge" : "Additional charge"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                placeholder="Transport"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (Rs)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount}
                placeholder="1000"
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Frequency</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.frequency === "every_month"}
                  onChange={() => setForm((f) => ({ ...f, frequency: "every_month" }))}
                />
                Every month
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={form.frequency === "selected_months"}
                  onChange={() => setForm((f) => ({ ...f, frequency: "selected_months" }))}
                />
                Selected months
              </label>
              {form.frequency === "selected_months" && (
                <div className="grid grid-cols-3 gap-2 rounded-lg border p-3">
                  {MONTH_NAMES.map((name, index) => {
                    const month = index + 1;
                    return (
                      <label key={name} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.months.includes(month)}
                          onChange={() =>
                            setForm((f) => ({ ...f, months: toggleId(f.months.map(String), String(month)).map(Number) }))
                          }
                        />
                        {name.slice(0, 3)}
                      </label>
                    );
                  })}
                </div>
              )}
            </fieldset>
            {!fixedClassId && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Applies to</legend>
              {(
                [
                  ["all", "All students"],
                  ["class", "Class / section"],
                  ["students", "Selected students"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={form.applicability === value}
                    onChange={() => setForm((f) => ({ ...f, applicability: value }))}
                  />
                  {label}
                </label>
              ))}
              {form.applicability === "class" && (
                <div className="space-y-2 rounded-lg border p-3">
                  <p className="text-xs text-slate-500">Classes</p>
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {classes.map((item) => (
                      <label key={item._id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.classIds.includes(item._id)}
                          onChange={() => setForm((f) => ({ ...f, classIds: toggleId(f.classIds, item._id) }))}
                        />
                        {item.className}
                      </label>
                    ))}
                  </div>
                  {visibleSections.length > 0 && (
                    <>
                      <p className="pt-1 text-xs text-slate-500">Sections (optional)</p>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {visibleSections.map((section) => (
                          <label key={section._id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={form.sectionIds.includes(section._id)}
                              onChange={() =>
                                setForm((f) => ({ ...f, sectionIds: toggleId(f.sectionIds, section._id) }))
                              }
                            />
                            {section.sectionName}
                            {section.className ? ` · ${section.className}` : ""}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {form.applicability === "students" && (
                <div className="space-y-2 rounded-lg border p-3">
                  <Input
                    value={studentQuery}
                    placeholder="Search student"
                    onChange={(e) => setStudentQuery(e.target.value)}
                  />
                  <p className="text-xs text-slate-500">{form.studentIds.length} selected</p>
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {(studentResult?.students || []).map((student) => (
                      <label key={student._id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.studentIds.includes(student._id)}
                          onChange={() =>
                            setForm((f) => ({ ...f, studentIds: toggleId(f.studentIds, student._id) }))
                          }
                        />
                        {student.studentName} ({student.studentId})
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </fieldset>
            )}
            {fixedClassId && visibleSections.length > 0 && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs text-slate-500">Sections (optional)</p>
                <div className="max-h-32 space-y-1 overflow-y-auto">
                  {visibleSections.map((section) => (
                    <label key={section._id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={form.sectionIds.includes(section._id)}
                        onChange={() =>
                          setForm((f) => ({ ...f, sectionIds: toggleId(f.sectionIds, section._id) }))
                        }
                      />
                      {section.sectionName}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Status</Label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saving…" : "Save charge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
