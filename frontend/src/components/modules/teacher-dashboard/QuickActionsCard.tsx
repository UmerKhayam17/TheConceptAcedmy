import { Link } from "react-router-dom";
import {
  ClipboardCheck,
  FilePlus2,
  GraduationCap,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Action = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: "blue" | "green" | "purple" | "orange";
};

const TONE = {
  blue: {
    wrap: "bg-[#EFF6FF] hover:bg-[#DBEAFE] border-[#BFDBFE]/70",
    icon: "bg-[#DBEAFE] text-[#1677E8]",
  },
  green: {
    wrap: "bg-[#ECFDF5] hover:bg-[#D1FAE5] border-[#A7F3D0]/70",
    icon: "bg-[#DCFCE7] text-[#16A66A]",
  },
  purple: {
    wrap: "bg-[#F5F3FF] hover:bg-[#EDE9FE] border-[#DDD6FE]/70",
    icon: "bg-[#EDE9FE] text-[#7C3AED]",
  },
  orange: {
    wrap: "bg-[#FFF7ED] hover:bg-[#FFEDD5] border-[#FED7AA]/70",
    icon: "bg-[#FFEDD5] text-[#EA580C]",
  },
} as const;

export function QuickActionsCard({
  attendanceHref,
  assignmentHref,
  gradesHref,
  messagesHref,
}: {
  attendanceHref: string;
  assignmentHref: string;
  gradesHref: string;
  messagesHref: string;
}) {
  const actions: Action[] = [
    {
      title: "Add Attendance",
      description: "Mark student attendance",
      href: attendanceHref,
      icon: ClipboardCheck,
      tone: "blue",
    },
    {
      title: "Add Assignment",
      description: "Create new assignment",
      href: assignmentHref,
      icon: FilePlus2,
      tone: "green",
    },
    {
      title: "View Grade Book",
      description: "Check student grades",
      href: gradesHref,
      icon: GraduationCap,
      tone: "purple",
    },
    {
      title: "Send Message",
      description: "Contact students/parents",
      href: messagesHref,
      icon: Mail,
      tone: "orange",
    },
  ];

  return (
    <Card className="rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_2px_8px_rgba(15,42,86,0.04)] p-5 h-full min-h-[340px]">
      <h2 className="text-[15px] font-semibold text-[#0F2A56] mb-4">Quick Actions</h2>
      <div className="grid gap-2.5">
        {actions.map((a) => {
          const Icon = a.icon;
          const tone = TONE[a.tone];
          return (
            <Link
              key={a.title}
              to={a.href}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677E8]/40",
                tone.wrap,
              )}
            >
              <span className={cn("h-10 w-10 rounded-xl grid place-items-center shrink-0", tone.icon)}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#0F2A56]">{a.title}</span>
                <span className="block text-xs text-[#64748B] mt-0.5">{a.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
