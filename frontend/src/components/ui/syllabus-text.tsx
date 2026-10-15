import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { containsUrduScript } from "@/lib/urduText";

type SyllabusTextProps = {
  text?: string | null;
  className?: string;
  empty?: ReactNode;
};

/** Renders syllabus with RTL + Jameel Noori Nastaleeq when Urdu is present. */
export function SyllabusText({ text, className, empty = "—" }: SyllabusTextProps) {
  const value = String(text ?? "").trim();
  if (!value) return <>{empty}</>;

  const isUrdu = containsUrduScript(value);
  return (
    <span
      dir={isUrdu ? "rtl" : "auto"}
      lang={isUrdu ? "ur" : undefined}
      className={cn(isUrdu && "font-urdu text-right leading-loose", className)}
    >
      {value}
    </span>
  );
}
