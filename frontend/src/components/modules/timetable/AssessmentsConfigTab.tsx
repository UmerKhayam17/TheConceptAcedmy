import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, GraduationCap, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import type { ModuleActionCaps } from "@/lib/permissions";
import { ASSESSMENT_TYPE_LABELS, type AssessmentType } from "@/lib/assessmentTaxonomy";
import {
  clearAssessmentPlan,
  fetchAssessmentPlan,
  initializeAssessmentPlan,
  type AssessmentPlanItem,
} from "@/lib/configApi";
import { testExamsHref } from "@/lib/testExamsMenus";

/**
 * System Config → Assessment Plan
 * Creates the session catalog only (TEST NO.1–15, Full Length, Full Book).
 * Class/section/syllabus assignment happens in Assessments → Assign.
 */
export default function AssessmentsConfigTab({
  sessionId,
  caps,
}: {
  sessionId: string;
  caps: ModuleActionCaps;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const role = user?.role ?? "admin";
  const canManage = caps.canCreate || caps.canEdit;
  const [branch, setBranch] = useState<"test" | "exam">("test");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["assessment-plan", sessionId],
    queryFn: () => fetchAssessmentPlan(sessionId),
    enabled: Boolean(sessionId),
  });

  const plan = data?.plan;
  const summary = data?.summary;
  const session = data?.session;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["assessment-plan", sessionId] });

  const initMut = useMutation({
    mutationFn: () => initializeAssessmentPlan(sessionId),
    onSuccess: () => {
      invalidate();
      toast({
        title: "Catalog created",
        description: "TEST NO.1–15 and exam papers are ready. Assign them to classes in Assessments.",
      });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const clearMut = useMutation({
    mutationFn: () => clearAssessmentPlan(sessionId),
    onSuccess: () => {
      invalidate();
      toast({ title: "Catalog cleared" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (!sessionId) {
    return (
      <p className="px-4 sm:px-6 lg:px-8 py-8 text-sm text-muted-foreground">
        Pick an academic session to manage the assessment catalog.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-12 flex justify-center text-muted-foreground text-sm gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
      </div>
    );
  }

  if (isError || !plan) {
    return (
      <p className="px-4 sm:px-6 lg:px-8 py-8 text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load assessment catalog."}
      </p>
    );
  }

  const tests = plan.items.filter((i) => i.category === "test");
  const exams = plan.items.filter((i) => i.category === "exam");

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-primary">Assessment catalog</h2>
          <p className="text-sm text-muted-foreground">
            {session?.name || "Session"} — create tests &amp; exams here. Assign to classes in the
            Assessments module.
          </p>
        </div>
        <Badge variant={plan.status === "ready" ? "default" : "outline"}>
          {plan.status === "ready" ? "Ready" : "Not started"}
        </Badge>
      </div>

      {plan.status === "empty" && (
        <Card className="p-6 space-y-4 border-dashed">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-semibold">Initialize tests &amp; exams</h3>
              <p className="text-sm text-muted-foreground">
                Creates <strong>TEST NO.1–15</strong> and{" "}
                <strong>FULL LENGTH PAPER-I–III</strong> + <strong>FULL BOOK PAPER</strong> for this
                session. No classes yet — assign those later under Assessments → Assign.
              </p>
            </div>
          </div>
          {canManage && (
            <Button onClick={() => initMut.mutate()} disabled={initMut.isPending}>
              {initMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create catalog
            </Button>
          )}
        </Card>
      )}

      {plan.status === "ready" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {summary?.testCount ?? tests.length} tests · {summary?.examCount ?? exams.length} exams
            · {summary?.assignmentCount ?? 0} class assignment(s)
          </p>

          <Tabs value={branch} onValueChange={(v) => setBranch(v as "test" | "exam")}>
            <TabsList>
              <TabsTrigger value="test" className="gap-1.5">
                <ClipboardList className="h-3.5 w-3.5" /> Tests
              </TabsTrigger>
              <TabsTrigger value="exam" className="gap-1.5">
                <GraduationCap className="h-3.5 w-3.5" /> Exams
              </TabsTrigger>
            </TabsList>
            <TabsContent value="test" className="mt-4">
              <CatalogList items={tests} />
            </TabsContent>
            <TabsContent value="exam" className="mt-4">
              <CatalogList items={exams} />
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap gap-2">
            <Button variant="default" asChild>
              <Link to={testExamsHref(role, "assign")}>Assign to classes →</Link>
            </Button>
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => clearMut.mutate()}
                disabled={clearMut.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear catalog
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogList({ items }: { items: AssessmentPlanItem[] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground py-6 text-center">No items.</p>;
  }
  return (
    <Card className="divide-y overflow-hidden">
      {items.map((item) => (
        <div key={item._id} className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-sm">{item.name}</div>
            <div className="text-xs text-muted-foreground">
              {ASSESSMENT_TYPE_LABELS[item.assessmentType as AssessmentType] || item.assessmentType}
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {item.assignmentCount ?? 0} class(es)
          </Badge>
        </div>
      ))}
    </Card>
  );
}
