import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, Trash2 } from "lucide-react";
import { ModuleActionCaps, PermLevel } from "@/lib/permissions";
import { useToast } from "@/hooks/use-toast";
import PanelSearchBar from "@/components/modules/PanelSearchBar";
import { matchesPanelSearch } from "@/lib/panelSearch";
import { useAuth } from "@/hooks/useAuth";
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  type Announcement,
  type AnnouncementAudience,
} from "@/lib/announcementApi";

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: "Everyone",
  teachers: "Teachers",
  parents: "Parents",
  class: "Class",
  section: "Section",
};

const AnnouncementsModule = ({ perm: _perm, caps }: { perm: PermLevel; caps: ModuleActionCaps }) => {
  const { user } = useAuth();
  const isParent = user?.role === "parent";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [search, setSearch] = useState("");

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["announcements", isParent ? "parent" : "all"],
    queryFn: () => fetchAnnouncements(),
  });

  const publishMut = useMutation({
    mutationFn: () => createAnnouncement({ title: title.trim(), body: body.trim(), targetAudience: audience }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Announcement published" });
      setTitle("");
      setBody("");
      setAudience("all");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      toast({ title: "Announcement removed" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const listFiltered = useMemo(() => {
    const scoped = isParent
      ? list.filter((a) => {
          const aud = String(a.targetAudience || "all");
          return aud === "all" || aud === "parents" || aud === "class" || aud === "section";
        })
      : list;
    const sorted = [...scoped].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (!search.trim()) return sorted;
    return sorted.filter((a) =>
      matchesPanelSearch(search, a.title, a.body, a.targetAudience, a.type)
    );
  }, [list, search, isParent]);

  const publish = () => {
    if (!title.trim()) return;
    publishMut.mutate();
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      {caps.canCreate && (
        <Card className="p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Audience</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={audience}
                onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
              >
                <option value="all">Everyone</option>
                <option value="teachers">Teachers</option>
                <option value="parents">Parents</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Message</Label>
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="text-right">
            <Button variant="hero" disabled={publishMut.isPending} onClick={publish}>
              <Plus className="h-4 w-4" /> Publish
            </Button>
          </div>
        </Card>
      )}

      <PanelSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search announcements…"
        className="max-w-lg"
      />

      <div className="space-y-3">
        {isLoading && (
          <p className="text-sm text-center text-muted-foreground py-6">Loading announcements…</p>
        )}
        {!isLoading && listFiltered.length === 0 && (
          <p className="text-sm text-center text-muted-foreground py-6">
            No announcements yet.
          </p>
        )}
        {listFiltered.map((a) => (
          <Card key={a._id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-accent uppercase tracking-wider">
                  {AUDIENCE_LABELS[a.targetAudience] || a.targetAudience}
                </div>
                <div className="font-semibold text-primary">{a.title}</div>
                <div className="text-sm text-muted-foreground mt-1">{a.body}</div>
                <div className="text-[11px] text-muted-foreground mt-2">
                  {new Date(a.createdAt).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })}
                </div>
              </div>
              {caps.canDelete && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteMut.isPending}
                  onClick={() => deleteMut.mutate(a._id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AnnouncementsModule;
