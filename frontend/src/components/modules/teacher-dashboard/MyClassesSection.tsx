import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ViewLink } from "./WelcomeBanner";
import { type TeacherClassCard } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";

const CLASS_TONES = [
  {
    bg: "bg-[#EFF6FF]",
    border: "border-[#BFDBFE]",
    iconBg: "bg-[#DBEAFE] text-[#2563EB]",
    btn: "border-[#93C5FD] text-[#2563EB] hover:bg-white",
  },
  {
    bg: "bg-[#ECFDF5]",
    border: "border-[#A7F3D0]",
    iconBg: "bg-[#D1FAE5] text-[#059669]",
    btn: "border-[#6EE7B7] text-[#059669] hover:bg-white",
  },
  {
    bg: "bg-[#F5F3FF]",
    border: "border-[#DDD6FE]",
    iconBg: "bg-[#EDE9FE] text-[#7C3AED]",
    btn: "border-[#C4B5FD] text-[#7C3AED] hover:bg-white",
  },
  {
    bg: "bg-[#FFF7ED]",
    border: "border-[#FED7AA]",
    iconBg: "bg-[#FFEDD5] text-[#EA580C]",
    btn: "border-[#FDBA74] text-[#EA580C] hover:bg-white",
  },
  {
    bg: "bg-[#FFF1F2]",
    border: "border-[#FECDD3]",
    iconBg: "bg-[#FFE4E6] text-[#E11D48]",
    btn: "border-[#FDA4AF] text-[#E11D48] hover:bg-white",
  },
] as const;

export function MyClassesSection({
  classes,
  classesHref,
  studentsHref,
  loading,
}: {
  classes: TeacherClassCard[];
  classesHref: string;
  studentsHref: string;
  loading?: boolean;
}) {
  return (
    <Card className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_2px_8px_rgba(15,42,86,0.04)] p-5 h-full min-h-[260px]">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-[#DBEAFE] grid place-items-center">
            <BookOpen className="h-4 w-4 text-[#2563EB]" strokeWidth={2.25} aria-hidden />
          </div>
          <h2 className="text-[15px] font-semibold text-[#0F2A56]">My Classes</h2>
        </div>
        <ViewLink to={classesHref}>View All Classes</ViewLink>
      </div>

      {loading ? (
        <p className="text-sm text-[#94A3B8] py-10 text-center">Loading classes…</p>
      ) : classes.length === 0 ? (
        <p className="text-sm text-[#94A3B8] py-10 text-center">
          No classes assigned for this session yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {classes.map((c, i) => {
            const tone = CLASS_TONES[i % CLASS_TONES.length];
            return (
              <div
                key={c.key}
                className={cn(
                  "rounded-2xl border p-4 flex flex-col min-h-[180px] min-w-0 w-full",
                  tone.bg,
                  tone.border,
                )}
              >
                <div className={cn("h-10 w-10 rounded-full grid place-items-center", tone.iconBg)}>
                  <BookOpen className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                </div>

                <h3 className="mt-3 font-bold text-[#0F2A56] text-[15px] truncate leading-tight">
                  {c.label}
                </h3>
                <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5B6B85]">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {c.studentCount == null ? "—" : `${c.studentCount} Students`}
                </p>
                <p className="mt-1 text-[12px] text-[#5B6B85] line-clamp-2 leading-snug flex-1">
                  {c.subjects.length ? c.subjects.join(", ") : "No subjects"}
                </p>

                <Link
                  to={studentsHref}
                  className={cn(
                    "mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-2.5 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/35",
                    tone.btn,
                  )}
                >
                  View Students
                  <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
