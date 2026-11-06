import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SlidersHorizontal } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ModuleActionCaps } from "@/lib/permissions";
import { fetchPeriodTemplates, fetchTimetableSettings, updateTimetableSettings } from "@/lib/timetableApi";

export default function TimetableSettingsTab({
  sessionId,
  caps,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    defaultPeriodTemplate: "",
    defaultMaxTeacherPerDay: 6,
    defaultMaxConsecutive: 2,
    conflictCheckOnDraft: true,
    publishRequiresCompleteQuotas: true,
    autoAssignRooms: true,
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["timetable-settings", sessionId],
    queryFn: () => fetchTimetableSettings(sessionId),
    enabled: !!sessionId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["timetable-periods", sessionId],
    queryFn: () => fetchPeriodTemplates(sessionId),
    enabled: !!sessionId,
  });

  useEffect(() => {
    if (!settings) return;
    const tplId =
      typeof settings.defaultPeriodTemplate === "object" && settings.defaultPeriodTemplate
        ? settings.defaultPeriodTemplate._id
        : (settings.defaultPeriodTemplate as string) || "";
    setForm({
      defaultPeriodTemplate: tplId,
      defaultMaxTeacherPerDay: settings.defaultMaxTeacherPerDay ?? 6,
      defaultMaxConsecutive: settings.defaultMaxConsecutive ?? 2,
      conflictCheckOnDraft: settings.conflictCheckOnDraft ?? true,
      publishRequiresCompleteQuotas: settings.publishRequiresCompleteQuotas ?? true,
      autoAssignRooms: settings.autoAssignRooms ?? true,
    });
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () => updateTimetableSettings(sessionId, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["timetable-settings", sessionId] });
      toast({ title: "Timetable settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!sessionId) {
    return null;
  }

  if (isLoading) {
    return <p className="p-6 text-muted-foreground text-sm">Loading settings…</p>;
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="rounded-xl border-0 bg-white px-4 py-3 sm:px-5 sm:py-3.5 shadow-sm ring-1 ring-black/[0.04]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary">
              <SlidersHorizontal className="h-5 w-5 text-primary-foreground" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#1a2b4b] leading-tight">
                Timetable Rules
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm leading-snug text-slate-500 max-w-xl">
                Set the default period template and the daily lecture limits used when building timetables.
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-lg bg-primary/10 px-3 py-2 max-w-[15rem]">
            <p className="text-xs sm:text-sm italic leading-snug text-[#1a2b4b]/80">
              <span className="mr-1 text-primary not-italic font-serif text-base leading-none">
                &ldquo;
              </span>
              A great school builds great futures.
              <span className="ml-0.5 text-primary not-italic font-serif text-base leading-none">
                &rdquo;
              </span>
            </p>
          </div>
        </div>
      </div>

      <Card className="p-6 max-w-xl space-y-4">

        <div>
          <Label>Default period template</Label>
          <select
            className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
            value={form.defaultPeriodTemplate}
            onChange={(e) => setForm((f) => ({ ...f, defaultPeriodTemplate: e.target.value }))}
            disabled={!caps.canEdit}
          >
            <option value="">None</option>
            {templates.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
                {t.isDefault ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Max teacher lectures / day</Label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
              value={form.defaultMaxTeacherPerDay}
              onChange={(e) => setForm((f) => ({ ...f, defaultMaxTeacherPerDay: Number(e.target.value) }))}
              disabled={!caps.canEdit}
            />
          </div>
          <div>
            <Label>Max consecutive (same subject)</Label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full h-10 rounded-md border px-3 text-sm"
              value={form.defaultMaxConsecutive}
              onChange={(e) => setForm((f) => ({ ...f, defaultMaxConsecutive: Number(e.target.value) }))}
              disabled={!caps.canEdit}
            />
          </div>
        </div>

        <ul className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.conflictCheckOnDraft}
              onChange={(e) => setForm((f) => ({ ...f, conflictCheckOnDraft: e.target.checked }))}
              disabled={!caps.canEdit}
            />
            Check teacher/room conflicts while editing drafts
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.publishRequiresCompleteQuotas}
              onChange={(e) => setForm((f) => ({ ...f, publishRequiresCompleteQuotas: e.target.checked }))}
              disabled={!caps.canEdit}
            />
            Require all weekly subject quotas before publish
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.autoAssignRooms}
              onChange={(e) => setForm((f) => ({ ...f, autoAssignRooms: e.target.checked }))}
              disabled={!caps.canEdit}
            />
            Auto-assign rooms when generating (future)
          </label>
        </ul>

        {caps.canEdit && (
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save settings"}
          </Button>
        )}
      </Card>
    </div>
  );
}
