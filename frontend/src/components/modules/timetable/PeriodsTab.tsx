import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import {
  createPeriodTemplate,
  deletePeriodTemplate,
  fetchPeriodTemplates,
  updatePeriodTemplate,
  type PeriodSlot,
} from "@/lib/timetableApi";
import { usePanelListSearch } from "@/hooks/usePanelListSearch";

const QK = (sid: string) => ["timetable-periods", sid] as const;

interface AcademyBreak {
  breakName: string;
  startTime: string;
  endTime: string;
}

type EditableSlot = {
  _id?: string;
  order: number;
  label: string;
  startTime: string;
  endTime: string;
  type: "lecture" | "break" | "assembly" | "prayer";
};

function parseTimeToMinutes(value: string) {
  const match = value.match(/^([0-1]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutesToTime(value: number) {
  const hour = Math.floor(value / 60);
  const minute = value % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function generatePeriods(
  startTime: string,
  endTime: string,
  duration: number,
  breaks: AcademyBreak[]
): EditableSlot[] {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) return [];
  const validatedBreaks = [...breaks]
    .map((br) => ({
      ...br,
      startMinutes: parseTimeToMinutes(br.startTime),
      endMinutes: parseTimeToMinutes(br.endTime),
    }))
    .filter((br) => br.startMinutes !== null && br.endMinutes !== null)
    .sort((a, b) => (a.startMinutes as number) - (b.startMinutes as number));

  let cursor = startMinutes;
  let period = 1;
  const slots: EditableSlot[] = [];

  const addLectureSegment = (segmentEnd: number) => {
    if (segmentEnd <= cursor) return;
    while (cursor + duration <= segmentEnd) {
      slots.push({
        order: slots.length + 1,
        label: `Period ${period}`,
        startTime: formatMinutesToTime(cursor),
        endTime: formatMinutesToTime(cursor + duration),
        type: "lecture",
      });
      cursor += duration;
      period += 1;
    }
    if (cursor < segmentEnd) {
      slots.push({
        order: slots.length + 1,
        label: `Period ${period}`,
        startTime: formatMinutesToTime(cursor),
        endTime: formatMinutesToTime(segmentEnd),
        type: "lecture",
      });
      cursor = segmentEnd;
      period += 1;
    }
  };

  for (const br of validatedBreaks) {
    if ((br.startMinutes as number) > cursor) {
      addLectureSegment(br.startMinutes as number);
    }
    slots.push({
      order: slots.length + 1,
      label: br.breakName,
      startTime: formatMinutesToTime(br.startMinutes as number),
      endTime: formatMinutesToTime(br.endMinutes as number),
      type: "break",
    });
    cursor = br.endMinutes as number;
  }

  addLectureSegment(endMinutes);
  return slots;
}

function slotsFromTemplate(slots: PeriodSlot[]): EditableSlot[] {
  return slots.map((s, i) => ({
    _id: s._id,
    order: s.order || i + 1,
    label: s.label,
    startTime: s.startTime,
    endTime: s.endTime,
    type: s.type,
  }));
}

/** Keep existing ids when regenerating so timetable period refs stay valid. */
function mergeSlotIds(existing: EditableSlot[], generated: EditableSlot[]): EditableSlot[] {
  const used = new Set<string>();
  return generated.map((slot, index) => {
    const prev = existing[index];
    if (prev?._id && prev.type === slot.type && !used.has(prev._id)) {
      used.add(prev._id);
      return { ...slot, _id: prev._id };
    }
    const byLabel = existing.find(
      (e) => e._id && e.label === slot.label && e.type === slot.type && !used.has(e._id)
    );
    if (byLabel?._id) {
      used.add(byLabel._id);
      return { ...slot, _id: byLabel._id };
    }
    return slot;
  });
}

export default function PeriodsTab({ sessionId, caps }: { sessionId: string; caps: ModuleActionCaps }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canSave = caps.canCreate || caps.canEdit;
  const { data: templates = [], isLoading } = useQuery({
    queryKey: QK(sessionId),
    queryFn: () => fetchPeriodTemplates(sessionId),
    enabled: !!sessionId,
  });

  const activeTemplate = useMemo(
    () => templates.find((t) => t.isDefault) || templates[0] || null,
    [templates]
  );

  const [form, setForm] = useState({
    academyStartTime: "",
    academyEndTime: "",
    periodDurationMinutes: 40,
    breaks: [] as AcademyBreak[],
    slots: [] as EditableSlot[],
  });

  useEffect(() => {
    if (!activeTemplate) {
      setForm({ academyStartTime: "", academyEndTime: "", periodDurationMinutes: 40, breaks: [], slots: [] });
      return;
    }
    const savedSlots = slotsFromTemplate(activeTemplate.slots || []);
    setForm({
      academyStartTime: activeTemplate.academyStartTime,
      academyEndTime: activeTemplate.academyEndTime,
      periodDurationMinutes: activeTemplate.periodDurationMinutes,
      breaks: activeTemplate.breaks ?? [],
      slots:
        savedSlots.length > 0
          ? savedSlots
          : generatePeriods(
              activeTemplate.academyStartTime,
              activeTemplate.academyEndTime,
              activeTemplate.periodDurationMinutes,
              activeTemplate.breaks ?? []
            ),
    });
  }, [activeTemplate]);

  const regenerateSlots = () => {
    const generated = generatePeriods(
      form.academyStartTime,
      form.academyEndTime,
      form.periodDurationMinutes,
      form.breaks
    );
    setForm((f) => ({
      ...f,
      slots: mergeSlotIds(f.slots, generated),
    }));
  };

  const createMut = useMutation({
    mutationFn: () =>
      createPeriodTemplate({
        session: sessionId,
        name: "Academy time configuration",
        academyStartTime: form.academyStartTime,
        academyEndTime: form.academyEndTime,
        periodDurationMinutes: form.periodDurationMinutes,
        breaks: form.breaks,
        isDefault: templates.length === 0,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      toast({ title: "Academy time configuration saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!activeTemplate) throw new Error("No configuration to update");
      return updatePeriodTemplate(activeTemplate._id, {
        name: activeTemplate.name || "Academy time configuration",
        academyStartTime: form.academyStartTime,
        academyEndTime: form.academyEndTime,
        periodDurationMinutes: form.periodDurationMinutes,
        breaks: form.breaks,
        slots: form.slots.map((s, i) => ({
          ...(s._id ? { _id: s._id } : {}),
          order: i + 1,
          label: s.label,
          startTime: s.startTime,
          endTime: s.endTime,
          type: s.type,
        })) as PeriodSlot[],
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      qc.invalidateQueries({ queryKey: ["timetable-grid"] });
      qc.invalidateQueries({ queryKey: ["class-board"] });
      toast({ title: "Academy time configuration updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: deletePeriodTemplate,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK(sessionId) });
      toast({ title: "Configuration deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const { filtered: templatesFiltered } = usePanelListSearch(templates, (t) => [
    t.name || "",
    t.academyStartTime,
    t.academyEndTime,
    String(t.periodDurationMinutes),
    ...t.breaks.map((b) => [b.breakName, b.startTime, b.endTime].join(" ")),
  ]);

  const breakErrors = form.breaks.map((br) => {
    const start = parseTimeToMinutes(br.startTime);
    const end = parseTimeToMinutes(br.endTime);
    if (start === null || end === null) return "Invalid time";
    if (end <= start) return "End time must be after start time";
    return null;
  });

  const slotErrors = form.slots.map((slot) => {
    const start = parseTimeToMinutes(slot.startTime);
    const end = parseTimeToMinutes(slot.endTime);
    if (start === null || end === null) return "Invalid time";
    if (end <= start) return "End must be after start";
    return null;
  });

  const hasErrors =
    !form.academyStartTime ||
    !form.academyEndTime ||
    !form.periodDurationMinutes ||
    parseTimeToMinutes(form.academyStartTime) === null ||
    parseTimeToMinutes(form.academyEndTime) === null ||
    (parseTimeToMinutes(form.academyEndTime) as number) <=
      (parseTimeToMinutes(form.academyStartTime) as number) ||
    form.breaks.some((_, index) => breakErrors[index] !== null) ||
    (activeTemplate ? form.slots.length === 0 || slotErrors.some((e) => e !== null) : false);

  const updateSlot = (index: number, patch: Partial<EditableSlot>) => {
    setForm((f) => {
      const next = [...f.slots];
      next[index] = { ...next[index], ...patch };
      return { ...f, slots: next };
    });
  };

  if (!sessionId) return null;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Academy Time Configuration</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Define academy hours and breaks to generate periods, then edit any period&apos;s start and end
            time as needed.
          </p>
        </div>
        {activeTemplate && caps.canDelete && (
          <Button
            variant="destructive"
            onClick={() => {
              if (!confirm("Delete this configuration?")) return;
              deleteMut.mutate(activeTemplate._id);
            }}
            disabled={deleteMut.isPending}
          >
            Delete configuration
          </Button>
        )}
      </div>

      <Card className="p-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Academy start time</Label>
              <Input
                type="time"
                value={form.academyStartTime}
                onChange={(e) => setForm((f) => ({ ...f, academyStartTime: e.target.value }))}
              />
            </div>
            <div>
              <Label>Academy end time</Label>
              <Input
                type="time"
                value={form.academyEndTime}
                onChange={(e) => setForm((f) => ({ ...f, academyEndTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="sm:w-48">
            <Label>Default period duration</Label>
            <Input
              type="number"
              min={1}
              value={form.periodDurationMinutes}
              onChange={(e) => setForm((f) => ({ ...f, periodDurationMinutes: Number(e.target.value) }))}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Breaks</Label>
                <p className="text-xs text-muted-foreground">Add one or more breaks inside academy hours.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    breaks: [...f.breaks, { breakName: "Break", startTime: "", endTime: "" }],
                  }))
                }
              >
                <Plus className="h-4 w-4" /> Add break
              </Button>
            </div>

            <div className="space-y-3">
              {form.breaks.map((breakRow, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 p-3 border rounded-lg">
                  <div>
                    <Label>Break name</Label>
                    <Input
                      value={breakRow.breakName}
                      onChange={(e) => {
                        const next = [...form.breaks];
                        next[index] = { ...next[index], breakName: e.target.value };
                        setForm((f) => ({ ...f, breaks: next }));
                      }}
                    />
                  </div>
                  <div>
                    <Label>Start time</Label>
                    <Input
                      type="time"
                      value={breakRow.startTime}
                      onChange={(e) => {
                        const next = [...form.breaks];
                        next[index] = { ...next[index], startTime: e.target.value };
                        setForm((f) => ({ ...f, breaks: next }));
                      }}
                    />
                  </div>
                  <div>
                    <Label>End time</Label>
                    <Input
                      type="time"
                      value={breakRow.endTime}
                      onChange={(e) => {
                        const next = [...form.breaks];
                        next[index] = { ...next[index], endTime: e.target.value };
                        setForm((f) => ({ ...f, breaks: next }));
                      }}
                    />
                    {breakErrors[index] && (
                      <p className="text-xs text-destructive mt-1">{breakErrors[index]}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="self-end"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        breaks: f.breaks.filter((_, idx) => idx !== index),
                      }));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <Label>Notes</Label>
            <Textarea
              readOnly
              value={
                "Periods are generated from academy hours by default. Edit any period time in the table, then save. Use Regenerate to rebuild periods from the settings above."
              }
            />
          </div>

          {canSave && (
            <div className="flex flex-wrap gap-2">
              {activeTemplate && (
                <Button type="button" variant="outline" onClick={regenerateSlots}>
                  <RefreshCw className="h-4 w-4 mr-1.5" />
                  Regenerate periods
                </Button>
              )}
              <Button
                onClick={() => {
                  if (activeTemplate) {
                    updateMut.mutate();
                    return;
                  }
                  // First save: generate then create
                  const generated = generatePeriods(
                    form.academyStartTime,
                    form.academyEndTime,
                    form.periodDurationMinutes,
                    form.breaks
                  );
                  if (!generated.length) {
                    toast({
                      title: "Invalid configuration",
                      description: "Check academy hours and duration.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setForm((f) => ({ ...f, slots: generated }));
                  createMut.mutate();
                }}
                disabled={hasErrors || createMut.isPending || updateMut.isPending}
              >
                {activeTemplate ? "Update configuration" : "Save configuration"}
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-primary">Periods</h2>
            <p className="text-sm text-muted-foreground">
              {activeTemplate
                ? "Edit start/end times for any period, then update the configuration."
                : "Save the configuration first to generate periods, then you can edit times."}
            </p>
          </div>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Start</th>
                  <th className="px-3 py-2">End</th>
                  <th className="px-3 py-2">Type</th>
                </tr>
              </thead>
              <tbody>
                {(form.slots.length
                  ? form.slots
                  : generatePeriods(
                      form.academyStartTime,
                      form.academyEndTime,
                      form.periodDurationMinutes,
                      form.breaks
                    )
                ).map((p, index) => {
                  const editable = Boolean(activeTemplate && form.slots.length);
                  const err = editable ? slotErrors[index] : null;
                  return (
                    <tr key={p._id || `${p.label}-${index}`} className={p.type === "break" ? "bg-muted/10" : ""}>
                      <td className="px-3 py-2 align-top">
                        {editable ? (
                          <Input
                            className="h-8 text-sm font-medium"
                            value={p.label}
                            onChange={(e) => updateSlot(index, { label: e.target.value })}
                          />
                        ) : (
                          <span className="font-medium">{p.label}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {editable ? (
                          <Input
                            type="time"
                            className="h-8 font-mono text-xs"
                            value={p.startTime}
                            onChange={(e) => updateSlot(index, { startTime: e.target.value })}
                          />
                        ) : (
                          <span className="font-mono text-xs">{p.startTime}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {editable ? (
                          <div>
                            <Input
                              type="time"
                              className="h-8 font-mono text-xs"
                              value={p.endTime}
                              onChange={(e) => updateSlot(index, { endTime: e.target.value })}
                            />
                            {err && <p className="text-[11px] text-destructive mt-1">{err}</p>}
                          </div>
                        ) : (
                          <span className="font-mono text-xs">{p.endTime}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-muted-foreground capitalize align-top pt-3">
                        {p.type}
                      </td>
                    </tr>
                  );
                })}
                {!form.slots.length &&
                  !generatePeriods(
                    form.academyStartTime,
                    form.academyEndTime,
                    form.periodDurationMinutes,
                    form.breaks
                  ).length && (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                        Set academy hours to preview periods.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </Card>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-primary">Saved configurations</h2>
          <span className="text-sm text-muted-foreground">{templates.length} saved</span>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : templatesFiltered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No saved configurations yet.</p>
        ) : (
          <div className="grid gap-4">
            {templatesFiltered.map((template) => (
              <Card key={template._id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <h3 className="font-semibold text-primary">{template.name || "Academy time configuration"}</h3>
                    <p className="text-sm text-muted-foreground">
                      {template.academyStartTime} – {template.academyEndTime}, {template.periodDurationMinutes} min
                    </p>
                  </div>
                  {template.isDefault && (
                    <span className="rounded-full bg-accent/10 px-2 py-1 text-xs text-accent">Default</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {template.slots.map((s) => (
                        <tr key={s._id} className="border-t">
                          <td className="py-1.5 pr-3 font-medium">{s.label}</td>
                          <td className="py-1.5 font-mono text-muted-foreground">
                            {s.startTime} – {s.endTime}
                          </td>
                          <td className="py-1.5 pl-3 capitalize text-muted-foreground">{s.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
