import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Download, FileSpreadsheet, ArrowLeft, Save } from "lucide-react";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import {
  createDatasheet,
  deleteDatasheet,
  fetchDatasheet,
  fetchDatasheets,
  updateDatasheet,
  type Datasheet,
} from "@/lib/datasheetApi";

const toCSV = (s: Pick<Datasheet, "name" | "columns" | "rows">) => {
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  return [s.columns.map(esc).join(","), ...s.rows.map((r) => r.map(esc).join(","))].join("\n");
};

const downloadCSV = (s: Pick<Datasheet, "name" | "columns" | "rows">) => {
  const blob = new Blob([toCSV(s)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${s.name.replace(/\s+/g, "_")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

/** API may return null rows/columns for legacy documents. */
function normalizeDatasheet(s: Datasheet): Datasheet {
  const columns = Array.isArray(s.columns) ? s.columns : [];
  const rawRows = Array.isArray(s.rows) ? s.rows : [];
  const rows = rawRows.map((r) =>
    Array.isArray(r) ? [...r] : columns.map(() => "")
  );
  return { ...s, columns, rows };
}

const DatasheetsModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canEditCells = caps.canEdit;
  const canDelete = caps.canDelete;
  const canCreate = caps.canCreate;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCols, setNewCols] = useState("Name, Email, Phone");
  const [newRowCount, setNewRowCount] = useState(5);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Datasheet | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["datasheets", search],
    queryFn: () => fetchDatasheets({ search: search.trim() || undefined, limit: 100 }),
    enabled: !activeId,
  });

  const { data: activeSheet, isLoading: sheetLoading } = useQuery({
    queryKey: ["datasheet", activeId],
    queryFn: () => fetchDatasheet(activeId!),
    enabled: Boolean(activeId),
  });

  useEffect(() => {
    if (activeSheet) setDraft(normalizeDatasheet(activeSheet));
  }, [activeSheet]);

  const sheets = listData?.sheets ?? [];
  const active = draft;

  const persistDraft = useCallback(
    (next: Datasheet) => {
      if (!canEditCells || !next._id) return;
      setDraft(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          await updateDatasheet(next._id, {
            name: next.name,
            columns: next.columns,
            rows: next.rows,
          });
          qc.invalidateQueries({ queryKey: ["datasheets"] });
          qc.invalidateQueries({ queryKey: ["datasheet", next._id] });
        } catch (e) {
          toast({
            title: "Save failed",
            description: e instanceof Error ? e.message : "Could not save",
            variant: "destructive",
          });
        }
      }, 600);
    },
    [canEditCells, qc, toast]
  );

  const createMut = useMutation({
    mutationFn: () => {
      const cols = newCols.split(",").map((c) => c.trim()).filter(Boolean);
      if (!newName.trim() || cols.length === 0) {
        throw new Error("Name and at least one column required");
      }
      return createDatasheet({
        name: newName.trim(),
        columns: cols,
        initialRows: Math.max(1, newRowCount),
      });
    },
    onSuccess: (sheet) => {
      qc.invalidateQueries({ queryKey: ["datasheets"] });
      setCreating(false);
      setNewName("");
      setNewCols("Name, Email, Phone");
      setNewRowCount(5);
      setActiveId(sheet._id);
      toast({ title: "Datasheet created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteDatasheet,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["datasheets"] });
      setActiveId(null);
      setDraft(null);
      toast({ title: "Deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteSheet = (id: string) => {
    if (!canDelete) return;
    if (!confirm("Delete this datasheet?")) return;
    deleteMut.mutate(id);
  };

  const updateActive = (mut: (s: Datasheet) => Datasheet) => {
    if (!active) return;
    persistDraft(mut(active));
  };

  const sheetsFiltered = useMemo(() => {
    if (!search.trim()) return sheets;
    return sheets.filter((s) => {
      const norm = normalizeDatasheet(s);
      return matchesPanelSearch(
        search,
        norm.name,
        norm.columns.join(" "),
        String(norm.rows.length)
      );
    });
  }, [sheets, search]);

  const editorRowIndexes = useMemo(() => {
    if (!active) return [];
    const rows = active.rows ?? [];
    if (!search.trim()) return rows.map((_, i) => i);
    return rows
      .map((row, i) =>
        matchesPanelSearch(search, ...(row ?? []), String(i + 1)) ? i : -1
      )
      .filter((i) => i >= 0);
  }, [active, search]);

  if (activeId && (sheetLoading || !active)) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-10 text-center text-muted-foreground text-sm">
        Loading datasheet…
      </div>
    );
  }

  if (!activeId) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-display text-xl font-bold text-primary">Datasheets</h2>
          </div>
          {canCreate && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New Datasheet
            </Button>
          )}
        </div>

        <PanelSearchBar value={search} onChange={setSearch} placeholder="Search datasheet names…" className="max-w-md" />

        {listLoading && (
          <Card className="p-10 text-center text-muted-foreground">Loading datasheets…</Card>
        )}
        {!listLoading && sheets.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-accent" />
            No datasheets yet.
          </Card>
        )}
        {!listLoading && sheets.length > 0 && sheetsFiltered.length === 0 && (
          <Card className="p-10 text-center text-muted-foreground">No datasheets match your search.</Card>
        )}
        {!listLoading && sheetsFiltered.length > 0 && (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {sheetsFiltered.map((raw) => {
              const s = normalizeDatasheet(raw);
              return (
              <Card key={s._id} className="p-4 hover:shadow-elegant transition-smooth">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 grid place-items-center shrink-0">
                    <FileSpreadsheet className="h-5 w-5 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setActiveId(s._id)}
                      className="font-semibold text-primary hover:underline text-left truncate block w-full"
                    >
                      {s.name}
                    </button>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.columns.length} cols · {s.rows.length} rows
                    </div>
                    {s.updatedAt && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Updated {new Date(s.updatedAt).toLocaleString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => setActiveId(s._id)}>
                    Open
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadCSV(s)} className="gap-1">
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                  {canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteSheet(s._id)}
                      className="ml-auto text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
            })}
          </div>
        )}

        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Datasheet</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Sheet name</label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Trip Permission Slips" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Columns (comma-separated)</label>
                <Input value={newCols} onChange={(e) => setNewCols(e.target.value)} placeholder="Name, Email, Phone" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Initial rows</label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={newRowCount}
                  onChange={(e) => setNewRowCount(Number(e.target.value) || 1)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button disabled={createMut.isPending} onClick={() => createMut.mutate()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActiveId(null);
              setDraft(null);
            }}
            className="gap-1"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {canEditCells ? (
            <Input
              value={active.name}
              onChange={(e) => updateActive((s) => ({ ...s, name: e.target.value }))}
              className="h-9 max-w-xs font-semibold"
            />
          ) : (
            <h2 className="font-semibold text-primary truncate">{active.name}</h2>
          )}
        </div>
        <PanelSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search rows and columns…"
          className="max-w-md w-full sm:w-auto"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => downloadCSV(active)} className="gap-1">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {canEditCells && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateActive((s) => ({
                    ...s,
                    columns: [...s.columns, `Col ${s.columns.length + 1}`],
                    rows: s.rows.map((r) => [...r, ""]),
                  }))
                }
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> Column
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  updateActive((s) => ({
                    ...s,
                    rows: [...s.rows, s.columns.map(() => "")],
                  }))
                }
                className="gap-1"
              >
                <Plus className="h-4 w-4" /> Row
              </Button>
            </>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-secondary/60">
              <tr>
                <th className="w-10 px-2 py-2 text-xs text-muted-foreground border-b border-border">#</th>
                {active.columns.map((c, ci) => (
                  <th key={ci} className="px-2 py-2 border-b border-border min-w-[140px] text-left">
                    {canEditCells ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={c}
                          className="h-8 font-semibold"
                          onChange={(e) =>
                            updateActive((s) => {
                              const cols = [...s.columns];
                              cols[ci] = e.target.value;
                              return { ...s, columns: cols };
                            })
                          }
                        />
                        {canDelete && active.columns.length > 1 && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() =>
                              updateActive((s) => ({
                                ...s,
                                columns: s.columns.filter((_, i) => i !== ci),
                                rows: s.rows.map((r) => r.filter((_, i) => i !== ci)),
                              }))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="font-semibold text-primary">{c}</span>
                    )}
                  </th>
                ))}
                {canDelete && <th className="w-10 border-b border-border" />}
              </tr>
            </thead>
            <tbody>
              {editorRowIndexes.length === 0 && search.trim() && (
                <tr>
                  <td
                    colSpan={active.columns.length + (canDelete ? 2 : 1)}
                    className="p-6 text-center text-muted-foreground"
                  >
                    No rows match your search.
                  </td>
                </tr>
              )}
              {editorRowIndexes.map((ri) => {
                const row = active.rows[ri];
                return (
                  <tr key={ri} className="border-b border-border hover:bg-muted/30">
                    <td className="px-2 py-1 text-xs text-muted-foreground text-center">{ri + 1}</td>
                    {active.columns.map((_, ci) => (
                      <td key={ci} className="px-1 py-1">
                        {canEditCells ? (
                          <Input
                            value={row[ci] ?? ""}
                            className="h-8 border-transparent hover:border-input focus:border-input"
                            onChange={(e) =>
                              updateActive((s) => {
                                const rows = s.rows.map((r) => [...r]);
                                rows[ri][ci] = e.target.value;
                                return { ...s, rows };
                              })
                            }
                          />
                        ) : (
                          <span className="px-2">{row[ci]}</span>
                        )}
                      </td>
                    ))}
                    {canDelete && (
                      <td className="px-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() =>
                            updateActive((s) => ({ ...s, rows: s.rows.filter((_, i) => i !== ri) }))
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {active.rows.length === 0 && (
                <tr>
                  <td colSpan={active.columns.length + 2} className="text-center text-muted-foreground py-6">
                    No rows.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default DatasheetsModule;
