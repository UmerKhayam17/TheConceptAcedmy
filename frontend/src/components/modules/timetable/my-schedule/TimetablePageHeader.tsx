import { CalendarDays } from "lucide-react";
import timetableBooks from "@/assets/timetable/timetable-books.png";

export function TimetablePageHeader() {
  return (
    <header className="relative flex h-[100px] items-center overflow-hidden rounded-lg bg-[#EAF3FF] px-5 sm:px-8 shadow-sm">
      <div className="flex items-center gap-4 sm:gap-5 min-w-0">
        <div className="grid size-12 place-items-center rounded-lg bg-white shadow-md shrink-0">
          <CalendarDays className="size-8 text-[#2563EB]" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-[#0B2347]">Your Timetable</h1>
          <p className="mt-1 text-[10px] font-semibold text-[#2563EB]">
            Here is your weekly teaching schedule. Stay organized and make the most of your day!
          </p>
        </div>
      </div>

      <div
        className="absolute -right-2 top-0 hidden h-full w-72 bg-[#2563EB]/5 [clip-path:ellipse(75%_110%_at_100%_70%)] md:block"
        aria-hidden
      />
      <img
        src={timetableBooks}
        alt=""
        width={992}
        height={672}
        className="absolute -right-1 -bottom-5 hidden h-[118px] w-auto object-contain md:block pointer-events-none select-none"
        draggable={false}
      />
    </header>
  );
}
