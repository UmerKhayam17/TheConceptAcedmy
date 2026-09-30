import { CheckCircle2, Clock3, PlayCircle } from "lucide-react";
import type { ScheduleStatus } from "@/lib/teacherDashboard";
export {
  LEGEND_SUBJECTS,
  subjectIcon,
  subjectTheme,
  type SubjectTheme,
} from "@/lib/subjectTheme";

export const STATUS_STYLE: Record<
  ScheduleStatus,
  { label: string; className: string; Icon: typeof CheckCircle2; dot: string }
> = {
  completed: {
    label: "Completed",
    className: "bg-green-100 text-green-700",
    Icon: CheckCircle2,
    dot: "bg-green-500",
  },
  ongoing: {
    label: "Ongoing",
    className: "bg-blue-100 text-blue-700",
    Icon: PlayCircle,
    dot: "bg-blue-500",
  },
  upcoming: {
    label: "Upcoming",
    className: "bg-indigo-100 text-indigo-700",
    Icon: Clock3,
    dot: "bg-indigo-500",
  },
};
