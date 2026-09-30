import { createdByLabel, type CreatedByUser } from "@/lib/createdBy";

export default function CreatedByLine({
  createdBy,
  label = "Created by",
  className = "",
}: {
  createdBy?: CreatedByUser | string | null;
  label?: string;
  className?: string;
}) {
  const name = createdByLabel(createdBy);
  if (name === "—") return null;
  return (
    <p
      className={`text-[15px] leading-tight text-muted-foreground/90 ${className}`.trim()}
    >
      {label} <span className="text-muted-foreground">{name}</span>
    </p>
  );
}
