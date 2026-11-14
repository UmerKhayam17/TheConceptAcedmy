import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { useAuth } from "@/hooks/useAuth";
import { usePanelSessionOptional } from "@/components/panel-header/PanelSessionContext";
import { resolveUploadUrl } from "@/lib/api";
import {
  fetchAcademyStudents,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { cn } from "@/lib/utils";

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function classSectionLine(student: AcademyStudent) {
  const rawClass = classLabel(student.classId);
  const className =
    rawClass && rawClass !== "—"
      ? /^class\b/i.test(rawClass)
        ? rawClass
        : `Class ${rawClass}`
      : "";
  const rawSection = refName(student.sectionId, "sectionName") || refName(student.sectionId, "name");
  const section = rawSection
    ? /^section\b/i.test(rawSection)
      ? rawSection
      : `Section ${rawSection}`
    : "";
  return [className, section].filter(Boolean).join(" · ");
}

function InfoRow({
  label,
  value,
  last,
  valueClassName,
}: {
  label: string;
  value: string;
  last?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className={cn(!last && "border-b border-[#EEF2F6]")}>
      <div className="px-4 py-3.5">
        <p className="text-[12px] font-medium text-[#94A3B8]">{label}</p>
        <p className={cn("mt-1 truncate text-[16px] font-bold text-[#111827]", valueClassName)}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function ProfileCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <h2 className="px-4 pb-1 pt-4 text-[17px] font-bold text-[#111827]">{title}</h2>
      {children}
    </section>
  );
}

export default function ParentMobileProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const panelSession = usePanelSessionOptional();
  const [childId, setChildId] = useState(() => {
    try {
      return localStorage.getItem("parent_selected_student_id") || "";
    } catch {
      return "";
    }
  });

  const { data: children = [], isLoading } = useQuery({
    queryKey: ["parent-children-profile", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!children.length) return;
    if (childId && children.some((c) => c._id === childId)) return;
    setChildId(children[0]._id);
  }, [children, childId]);

  useEffect(() => {
    try {
      if (childId) localStorage.setItem("parent_selected_student_id", childId);
    } catch {
      /* ignore */
    }
  }, [childId]);

  const selected = useMemo(
    () => children.find((c) => c._id === childId) || children[0] || null,
    [children, childId],
  );

  const photo = user?.profileImage ? resolveUploadUrl(user.profileImage) : "";
  const loginId = user?.email || "—";
  const sessionLabel = panelSession?.selected?.name
    ? panelSession.selected.name
    : panelSession?.isLoading
      ? "Loading…"
      : "—";
  const linkedCount = children.length;
  const linkedHint =
    linkedCount <= 0
      ? "No children linked yet."
      : linkedCount === 1
        ? "1 linked child — switch from Home if more are added."
        : `${linkedCount} linked children — switch from Home or Select Child.`;

  return (
    <div className="min-h-full bg-white pb-10">
      <ParentMobilePageHeader title="Profile" onBack={() => navigate("/panel/parent")} />

      <div className="space-y-4 px-4 pt-4">
        <section className="flex flex-col items-center rounded-[22px] bg-white px-4 py-6 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full bg-[#22C5D6] text-white shadow-sm">
            {photo ? (
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-9 w-9" strokeWidth={1.5} />
            )}
          </span>
          <h2 className="mt-3 max-w-full truncate text-center text-[20px] font-bold text-[#111827]">
            {user?.name || "Parent"}
          </h2>
          <span className="mt-2 rounded-full bg-[#E6F9FB] px-3.5 py-1 text-[12px] font-semibold text-[#14B8A6]">
            Parent
          </span>
        </section>

        <ProfileCard title="Account">
          <InfoRow label="Login ID" value={loginId} />
          <InfoRow label="Designation" value="Parent" />
          <InfoRow label="Branch" value="The Concept Academy" />
          <InfoRow label="Session" value={sessionLabel} last />
        </ProfileCard>

        <ProfileCard title="Active child">
          {isLoading ? (
            <div className="space-y-3 px-4 py-4">
              <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
              <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
              <div className="h-10 animate-pulse rounded-lg bg-[#F1F5F9]" />
            </div>
          ) : selected ? (
            <>
              <InfoRow
                label="Name"
                value={selected.studentName}
                valueClassName="text-[18px] font-extrabold text-[#102A43]"
              />
              <InfoRow
                label="Class"
                value={classSectionLine(selected) || "—"}
                valueClassName="text-[16px] font-bold text-[#0F3A4A]"
              />
              <InfoRow label="Father" value={selected.fatherName || "—"} />
              <InfoRow
                label="Registration"
                value={selected.registrationNumber || selected.studentId || "—"}
              />
              <InfoRow label="Contact" value={selected.phone || "—"} last />
              <p className="px-4 pb-4 pt-1 text-[12px] font-medium text-[#94A3B8]">{linkedHint}</p>
            </>
          ) : (
            <p className="px-4 py-5 text-[14px] font-medium text-[#94A3B8]">
              No children linked to this account yet.
            </p>
          )}
        </ProfileCard>
      </div>
    </div>
  );
}
