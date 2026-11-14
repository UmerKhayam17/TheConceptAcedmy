import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronDown,
  Eye,
  Images,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import ParentEmptyMessage from "@/components/modules/parent/ParentEmptyMessage";
import ParentMobilePageHeader from "@/components/modules/parent/ParentMobilePageHeader";
import { ParentOptionSheet } from "@/components/modules/parent/ParentOptionSheet";
import { resolveUploadUrl } from "@/lib/api";
import { fetchAnnouncements, type Announcement } from "@/lib/announcementApi";
import { cn } from "@/lib/utils";

const MONTH_OPTIONS = [
  { value: "all", label: "All Months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function announcementDate(item: Announcement) {
  return item.publishedAt || item.createdAt;
}

function dateKey(item: Announcement) {
  const raw = announcementDate(item);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isImageUrl(url?: string) {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url) || /\/uploads\//i.test(url);
}

function imageAttachments(item: Announcement) {
  return (item.attachments || [])
    .map((file) => {
      const url = file.url ? resolveUploadUrl(file.url) : "";
      return url && isImageUrl(file.url || url) ? { ...file, url } : null;
    })
    .filter(Boolean) as { name?: string; url: string }[];
}

function previewBody(body: string) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  if (!text) return "Details";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function NoticeDetailSheet({
  item,
  onClose,
}: {
  item: Announcement;
  onClose: () => void;
}) {
  const images = imageAttachments(item);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end bg-[#4B5563]/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="max-h-[82vh] w-full overflow-y-auto rounded-t-[28px] bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(15,23,42,0.12)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[#E5E7EB]" />
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="min-w-0 flex-1 truncate text-[20px] font-extrabold text-[#102A43]">{item.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full bg-[#F1F5F9] text-[#64748B]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
        <p className="px-5 text-[13px] font-semibold text-[#94A3B8]">{dateKey(item)}</p>
        <div className="space-y-4 px-5 py-4">
          {item.body ? (
            <p className="whitespace-pre-wrap text-[15px] leading-6 text-[#334155]">{item.body}</p>
          ) : null}
          {images.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {images.map((image) => (
                <a
                  key={image.url}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-[14px] bg-[#F1F5F9]"
                >
                  <img src={image.url} alt={image.name || ""} className="h-36 w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ImageGallery({
  images,
  onClose,
}: {
  images: { name?: string; url: string }[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  if (typeof document === "undefined" || !images.length) return null;
  const current = images[Math.min(index, images.length - 1)];
  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-black/92" onClick={onClose}>
      <div className="flex items-center justify-between px-4 pb-2 pt-[calc(var(--safe-top)+0.5rem)]">
        <p className="text-[14px] font-semibold text-white">
          {index + 1} / {images.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white"
        >
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-3"
        onClick={(event) => event.stopPropagation()}
      >
        <img src={current.url} alt={current.name || ""} className="max-h-full max-w-full object-contain" />
      </div>
      {images.length > 1 ? (
        <div className="flex justify-center gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {images.map((image, i) => (
            <button
              key={image.url}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setIndex(i);
              }}
              className={cn("h-2 w-2 rounded-full", i === index ? "bg-white" : "bg-white/40")}
              aria-label={`Picture ${i + 1}`}
            />
          ))}
        </div>
      ) : (
        <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
      )}
    </div>,
    document.body,
  );
}

function DatePill({ day }: { day: string }) {
  return (
    <div className="relative mb-2.5 flex items-center">
      <span className="absolute -left-[17px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#22C5D6] ring-[3px] ring-[#E6F4FA]" />
      <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#22C5D6] shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
        <CalendarDays className="h-3.5 w-3.5" strokeWidth={2.25} />
        {day}
      </span>
    </div>
  );
}

function TextNoticeCard({
  item,
  onOpen,
}: {
  item: Announcement;
  onOpen: () => void;
}) {
  return (
    <article className="rounded-[20px] bg-white px-4 py-4 shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
      <h3 className="text-[18px] font-bold leading-tight text-[#102A43]">{item.title || "Notice"}</h3>
      <p className="mt-1.5 text-[14px] leading-5 text-[#9AA6B2]">{previewBody(item.body)}</p>
      <button
        type="button"
        onClick={onOpen}
        className="mt-2.5 text-[14px] font-semibold text-[#22C5D6]"
      >
        View Details →
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3.5 flex h-[48px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#22C5D6] text-[15px] font-bold text-white"
      >
        <Eye className="h-[18px] w-[18px]" strokeWidth={2.25} />
        View Details
      </button>
    </article>
  );
}

function PictureNoticeCard({
  item,
  images,
  onOpen,
}: {
  item: Announcement;
  images: { name?: string; url: string }[];
  onOpen: () => void;
}) {
  const cover = images[0]?.url;
  return (
    <article className="overflow-hidden rounded-[20px] bg-white shadow-[0_6px_18px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <h3 className="text-[18px] font-bold leading-tight text-[#102A43]">
          {item.title || "Pictures"}
        </h3>
        <button type="button" onClick={onOpen} className="text-[14px] font-semibold text-[#22C5D6]">
          Tap to view
        </button>
      </div>
      <button type="button" onClick={onOpen} className="block w-full px-3 pb-3">
        <span className="relative block overflow-hidden rounded-[14px] bg-[#E8EEF3]">
          {cover ? (
            <img src={cover} alt="" className="aspect-[16/10] w-full object-cover" />
          ) : (
            <span className="grid aspect-[16/10] place-items-center text-[#94A3B8]">
              <Images className="h-10 w-10" />
            </span>
          )}
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-md bg-[#4B5563]/80 px-2 py-1 text-[12px] font-semibold text-white">
            <Images className="h-3.5 w-3.5" strokeWidth={2.25} />
            {images.length} picture{images.length === 1 ? "" : "s"}
          </span>
        </span>
      </button>
    </article>
  );
}

export default function ParentMobileNoticeBoard() {
  const navigate = useNavigate();
  const [month, setMonth] = useState("all");
  const [monthOpen, setMonthOpen] = useState(false);
  const [detail, setDetail] = useState<Announcement | null>(null);
  const [gallery, setGallery] = useState<{ name?: string; url: string }[] | null>(null);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["announcements", "parent-mobile"],
    queryFn: () => fetchAnnouncements(),
  });

  const scoped = useMemo(() => {
    return list.filter((item) => {
      const aud = String(item.targetAudience || "all");
      return aud === "all" || aud === "parents" || aud === "class" || aud === "section";
    });
  }, [list]);

  const filtered = useMemo(() => {
    const rows =
      month === "all"
        ? scoped
        : scoped.filter((item) => {
            const d = new Date(announcementDate(item));
            if (Number.isNaN(d.getTime())) return false;
            return String(d.getMonth() + 1) === month;
          });
    return [...rows].sort(
      (a, b) => new Date(announcementDate(b)).getTime() - new Date(announcementDate(a)).getTime(),
    );
  }, [scoped, month]);

  const monthLabel = MONTH_OPTIONS.find((option) => option.value === month)?.label || "All Months";

  return (
    <div className="min-h-full bg-white pb-10">
      <ParentMobilePageHeader title="Notice Board" onBack={() => navigate("/panel/parent")} />

      <div className="px-5 pt-3">
        <button
          type="button"
          onClick={() => setMonthOpen(true)}
          className="flex w-full items-center justify-between border-b border-[#D5DEE6] pb-2.5 text-left"
        >
          <span className="text-[15px] font-medium text-[#A8B3C0]">Month</span>
          <span className="inline-flex items-center gap-1 text-[15px] font-semibold text-[#1F2A37]">
            {monthLabel}
            <ChevronDown className="h-4 w-4 text-[#22C5D6]" strokeWidth={2.5} />
          </span>
        </button>
      </div>

      <div className="px-4 pt-5">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-32 animate-pulse rounded-[20px] bg-white/70" />
            <div className="h-32 animate-pulse rounded-[20px] bg-white/70" />
          </div>
        ) : null}

        {!isLoading && filtered.length === 0 ? (
          <ParentEmptyMessage>
            No notices yet
            <span className="mt-1.5 block text-[14px] font-medium text-[#64748B]">
              School notices will appear here.
            </span>
          </ParentEmptyMessage>
        ) : null}

        <div className="relative">
          {filtered.length > 0 ? (
            <span className="absolute bottom-6 left-[4px] top-3 w-px bg-[#D3E4EC]" />
          ) : null}

          <ul className="space-y-5">
            {filtered.map((item) => {
              const images = imageAttachments(item);
              const day = dateKey(item);
              return (
                <li key={item._id} className="relative pl-5">
                  <DatePill day={day} />
                  {images.length > 0 ? (
                    <PictureNoticeCard
                      item={item}
                      images={images}
                      onOpen={() => setGallery(images)}
                    />
                  ) : (
                    <TextNoticeCard item={item} onOpen={() => setDetail(item)} />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <ParentOptionSheet
        open={monthOpen}
        title="Month"
        options={MONTH_OPTIONS}
        value={month}
        onClose={() => setMonthOpen(false)}
        onSelect={setMonth}
      />

      {detail ? <NoticeDetailSheet item={detail} onClose={() => setDetail(null)} /> : null}
      {gallery ? <ImageGallery images={gallery} onClose={() => setGallery(null)} /> : null}
    </div>
  );
}
