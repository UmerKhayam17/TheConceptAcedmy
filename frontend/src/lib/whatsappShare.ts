import { digitsOnly } from "@/lib/pkFieldFormat";

/** Absolute APK download URL for sharing with parents (direct install link). */
export function parentAppDownloadUrl(): string {
  if (typeof window === "undefined") return "/downloads/tca.apk";
  const { protocol, hostname, port } = window.location;
  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  if (isLocal) {
    return `${protocol}//${hostname}${port ? `:${port}` : ""}/downloads/tca.apk`;
  }
  // Prefer www host so the link opens cleanly in mobile Chrome (same as APK update notice).
  const host = hostname.startsWith("www.") ? hostname : `www.${hostname}`;
  return `${protocol}//${host}/downloads/tca.apk`;
}

/**
 * Convert a Pakistani mobile (03XXXXXXXXX) to WhatsApp digits (923XXXXXXXXX).
 * Returns null if the number is not a usable mobile.
 */
export function toWhatsAppPhone(raw?: string | null): string | null {
  const d = digitsOnly(raw || "");
  if (!d) return null;
  if (/^03\d{9}$/.test(d)) return `92${d.slice(1)}`;
  if (/^923\d{9}$/.test(d)) return d;
  if (/^3\d{9}$/.test(d)) return `92${d}`;
  return null;
}

export type ParentCredentialsChild = {
  studentName: string;
  studentId: string;
  rollNumber?: string;
  className?: string | null;
  sectionName?: string | null;
};

export type ParentCredentialsShareInput = {
  /** One or more linked children — same parent login covers all of them. */
  students: ParentCredentialsChild[];
  parentEmail: string;
  parentPassword: string;
};

function formatChildLine(child: ParentCredentialsChild, index: number, multi: boolean): string {
  const name = (child.studentName || "").trim() || "Student";
  const id = (child.studentId || "").trim() || "—";
  const roll = (child.rollNumber || "").trim();
  const classPart = [child.className, child.sectionName].filter(Boolean).join(" - ");
  const bits = [`${name}`, `ID: ${id}`];
  if (roll) bits.push(`Roll: ${roll}`);
  if (classPart) bits.push(classPart);
  const body = bits.join(" · ");
  return multi ? `${index + 1}. ${body}` : body;
}

/** Professional WhatsApp message with login details + direct APK download link. */
export function buildParentCredentialsWhatsAppMessage(input: ParentCredentialsShareInput): string {
  const students = (input.students || []).filter((s) => s && (s.studentName || s.studentId));
  const multi = students.length > 1;
  const lines = ["Assalam o Alaikum,", "", "Welcome to The Concept Academy Parent Portal.", ""];

  if (!students.length) {
    lines.push("Your child is linked to this parent portal.");
  } else if (multi) {
    lines.push(`Linked children (${students.length}):`);
    students.forEach((s, i) => lines.push(formatChildLine(s, i, true)));
  } else {
    const only = students[0];
    lines.push(`Student: ${(only.studentName || "").trim() || "your child"}`);
    lines.push(`Student ID: ${(only.studentId || "").trim() || "—"}`);
    const roll = (only.rollNumber || "").trim();
    if (roll) lines.push(`Roll No: ${roll}`);
    const classPart = [only.className, only.sectionName].filter(Boolean).join(" - ");
    if (classPart) lines.push(`Class: ${classPart}`);
  }

  lines.push(
    "",
    multi
      ? "One parent login works for all children above:"
      : "Please use the following login details:",
    `Email: ${input.parentEmail}`,
    `Password: ${input.parentPassword}`,
    "",
    "Download the Android app here:",
    parentAppDownloadUrl(),
    "",
    "Kindly keep these credentials confidential and change the password after your first login.",
    "",
    "Regards,",
    "The Concept Academy",
  );
  return lines.join("\n");
}

/** Opens WhatsApp (app or web) with a pre-filled message. Phone optional — picker opens if omitted. */
export function openWhatsAppShare(message: string, phone?: string | null): void {
  const text = encodeURIComponent(message);
  const wa = toWhatsAppPhone(phone);
  const url = wa ? `https://wa.me/${wa}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

const DEFAULT_PARENT_PASSWORD = "Concept@1234";

/** Build + open the standard parent credentials WhatsApp share (supports multiple children). */
export function shareParentPortalOnWhatsApp(input: {
  students?: ParentCredentialsChild[];
  /** @deprecated prefer `students` — kept for single-child call sites */
  studentName?: string;
  studentId?: string;
  rollNumber?: string;
  className?: string | null;
  sectionName?: string | null;
  parentEmail: string;
  parentPassword?: string;
  phone?: string | null;
}): void {
  const students =
    input.students && input.students.length > 0
      ? input.students
      : [
          {
            studentName: input.studentName || "",
            studentId: input.studentId || "—",
            rollNumber: input.rollNumber,
            className: input.className,
            sectionName: input.sectionName,
          },
        ];

  openWhatsAppShare(
    buildParentCredentialsWhatsAppMessage({
      students,
      parentEmail: input.parentEmail,
      parentPassword: input.parentPassword || DEFAULT_PARENT_PASSWORD,
    }),
    input.phone,
  );
}
