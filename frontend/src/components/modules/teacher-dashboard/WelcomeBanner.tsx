import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, ChevronRight, GraduationCap } from "lucide-react";
import { greetingForHour } from "@/lib/teacherDashboard";
import { cn } from "@/lib/utils";

export function WelcomeBanner({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const displayName = name?.trim() || "Teacher";
  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-[#D6E4F5] bg-[#EAF3FF] px-5 py-5 sm:px-7 sm:py-6"
      aria-label="Welcome"
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[#D7E9FF]/80 to-transparent" />
      <div className="pointer-events-none absolute -right-6 -top-10 h-44 w-44 rounded-full bg-sky-200/35 blur-3xl" />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4 min-w-0">
          <div className="h-14 w-14 sm:h-[4.25rem] sm:w-[4.25rem] rounded-full bg-white border-[3px] border-white shadow-md overflow-hidden grid place-items-center shrink-0 ring-1 ring-[#BFDBFE]">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <GraduationCap className="h-8 w-8 text-[#1677E8]" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-[1.4rem] sm:text-[1.7rem] font-bold tracking-tight text-[#0F2A56] leading-tight">
              {greetingForHour()}, {displayName}{" "}
              <span aria-hidden>👋</span>
            </h1>
            <p className="mt-1.5 text-sm text-[#5B6B85] leading-relaxed">
              Here&apos;s what&apos;s happening with your classes and students today.
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-4 shrink-0">
          <p className="max-w-[10.5rem] text-right text-[13px] italic font-medium text-[#3B82F6] leading-snug">
            “Great teachers build great futures.”
          </p>
          <EducationIllustration />
        </div>
      </div>
    </section>
  );
}

function EducationIllustration() {
  return (
    <div className="relative h-[4.75rem] w-[6.25rem]" aria-hidden>
      <div className="absolute bottom-1 left-0 h-11 w-8 rounded-[3px] bg-[#2563EB] shadow-md -rotate-[12deg] origin-bottom" />
      <div className="absolute bottom-1 left-5 h-12 w-8 rounded-[3px] bg-[#3B82F6] shadow-md -rotate-[4deg] origin-bottom" />
      <div className="absolute bottom-1 left-9 h-[3.25rem] w-8 rounded-[3px] bg-[#60A5FA] shadow-sm rotate-[6deg] origin-bottom" />
      <div className="absolute bottom-2 right-0 h-10 w-7 rounded-md bg-white border border-[#BFDBFE] shadow-sm flex flex-col items-center justify-end gap-0.5 pb-1.5">
        <span className="h-4 w-[3px] rounded-full bg-amber-400" />
        <span className="h-5 w-[3px] rounded-full bg-rose-400" />
        <span className="h-3.5 w-[3px] rounded-full bg-sky-500" />
      </div>
      <BookOpen className="absolute top-0 right-8 h-4 w-4 text-[#2563EB]/70" />
    </div>
  );
}

export function ViewLink({
  to,
  children,
  className,
  showArrow = true,
}: {
  to: string;
  children: ReactNode;
  className?: string;
  showArrow?: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-semibold text-[#1677E8] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677E8]/40 rounded-sm group/link",
        className,
      )}
    >
      <span>{children}</span>
      {showArrow ? (
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 transition-transform group-hover/link:translate-x-0.5"
          strokeWidth={2.25}
          aria-hidden
        />
      ) : null}
    </Link>
  );
}
