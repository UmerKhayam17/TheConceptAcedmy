import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, UserRound } from "lucide-react";
import { ParentOptionSheet } from "@/components/modules/parent/ParentOptionSheet";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchAcademyStudents,
  resolveUploadUrl,
  type AcademyStudent,
} from "@/lib/studentManagementApi";
import { classLabel } from "@/components/modules/student-management/studentDisplayUtils";
import { cn } from "@/lib/utils";

const BANNER = {
  wrap: "bg-[#FEF6DC]",
  avatar: "bg-white text-[#D97706]",
  name: "text-[#78350F]",
  meta: "text-[#92400E]",
  chevron: "text-[#D97706]",
} as const;

const STORAGE_KEY = "parent_selected_student_id";
const CHANGE_EVENT = "parent-child-changed";

function refName(ref: unknown, key: string) {
  if (!ref || typeof ref !== "object") return "";
  const value = (ref as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

export function classSectionLine(student: AcademyStudent) {
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

function readStoredId() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredId(id: string) {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function useParentSelectedChild() {
  const { user } = useAuth();
  const [selectedStudentId, setSelectedStudentIdState] = useState(readStoredId);

  const { data: children = [], isLoading: childrenLoading } = useQuery({
    queryKey: ["parent-children-banner", user?.id],
    queryFn: async () => {
      const { students } = await fetchAcademyStudents({ limit: 100 });
      return students as AcademyStudent[];
    },
    enabled: Boolean(user),
  });

  useEffect(() => {
    const sync = () => setSelectedStudentIdState(readStoredId());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    if (!children.length) return;
    if (!selectedStudentId || !children.some((child) => child._id === selectedStudentId)) {
      const next = children[0]._id;
      setSelectedStudentIdState(next);
      writeStoredId(next);
    }
  }, [children, selectedStudentId]);

  const setSelectedStudentId = (id: string) => {
    setSelectedStudentIdState(id);
    writeStoredId(id);
  };

  const selected = children.find((child) => child._id === selectedStudentId) || null;

  return {
    children,
    childrenLoading,
    selectedStudentId,
    setSelectedStudentId,
    selected,
  };
}

/** Match a notification to the selected child (or school-wide notices). */
export function notificationBelongsToChild(
  item: {
    title?: string;
    body?: string;
    meta?: Record<string, unknown> | null;
  },
  child: AcademyStudent | null,
  siblings: AcademyStudent[],
) {
  if (!child) return true;
  const meta = item.meta || {};
  const metaId = meta.studentId != null ? String(meta.studentId) : "";
  const metaName = typeof meta.studentName === "string" ? meta.studentName.trim() : "";
  if (metaId) return metaId === String(child._id);
  if (metaName) return metaName.toLowerCase() === child.studentName.toLowerCase();

  const blob = `${item.title || ""} ${item.body || ""}`.toLowerCase();
  const self = child.studentName.trim().toLowerCase();
  const mentionsSelf = Boolean(self && blob.includes(self));
  const mentionsOther = siblings.some((sibling) => {
    if (sibling._id === child._id) return false;
    const name = sibling.studentName.trim().toLowerCase();
    return Boolean(name && blob.includes(name));
  });
  if (mentionsOther && !mentionsSelf) return false;
  return true;
}

/** Match a chat conversation to the selected child (or school-wide chats). */
export function conversationBelongsToChild(
  conversation: {
    title?: string;
    lastMessagePreview?: string;
  },
  childName: string,
  siblingNames: string[],
) {
  const blob = `${conversation.title || ""} ${conversation.lastMessagePreview || ""}`.toLowerCase();
  const self = childName.trim().toLowerCase();
  const mentionsSelf = Boolean(self && blob.includes(self));
  const mentionsOther = siblingNames.some((name) => {
    const n = name.trim().toLowerCase();
    return Boolean(n && n !== self && blob.includes(n));
  });
  if (mentionsOther && !mentionsSelf) return false;
  return true;
}

export default function ParentChildSelectBanner({
  className,
}: {
  className?: string;
}) {
  const {
    children,
    childrenLoading,
    selectedStudentId,
    setSelectedStudentId,
    selected,
  } = useParentSelectedChild();
  const [sheetOpen, setSheetOpen] = useState(false);

  const photo = selected?.photoImage ? resolveUploadUrl(selected.photoImage) : "";
  const classLine = selected ? classSectionLine(selected) : "";
  const canSwitch = children.length > 1;

  return (
    <div
      className={cn(
        "mx-4 flex items-center gap-3 rounded-[18px] px-3.5 py-3",
        BANNER.wrap,
        className,
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full",
          BANNER.avatar,
        )}
      >
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-6 w-6" strokeWidth={1.75} />
        )}
      </span>
      {canSwitch ? (
        <>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-[18px] font-extrabold", BANNER.name)}>
                {selected?.studentName || "Select child"}
              </span>
              <span className={cn("mt-0.5 block truncate text-[16px] font-bold", BANNER.meta)}>
                {classLine || "—"}
              </span>
            </span>
            <ChevronDown className={cn("h-5 w-5 shrink-0", BANNER.chevron)} strokeWidth={2.25} />
          </button>
          <ParentOptionSheet
            open={sheetOpen}
            title="Child"
            value={selectedStudentId}
            options={children.map((child) => ({ value: child._id, label: child.studentName }))}
            onClose={() => setSheetOpen(false)}
            onSelect={setSelectedStudentId}
          />
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[18px] font-extrabold", BANNER.name)}>
            {childrenLoading ? "Loading…" : selected?.studentName || "No child linked"}
          </p>
          <p className={cn("mt-0.5 truncate text-[16px] font-bold", BANNER.meta)}>{classLine || "—"}</p>
        </div>
      )}
    </div>
  );
}
