import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Facebook,
  LogOut,
  Moon,
  Share2,
  ShieldCheck,
  User,
  UserRound,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SheetClose } from "@/components/ui/sheet";
import type { SessionUser } from "@/lib/auth";
import { logout } from "@/lib/auth";
import { resolveUploadUrl } from "@/lib/api";
import { moduleHref } from "@/lib/panelMenus";
import { cn } from "@/lib/utils";

function IconBubble({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#E0F7FA] text-[#0E7490]">
      {children}
    </span>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2.5 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#64748B]">
      {children}
    </p>
  );
}

function MenuCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[22px] border border-[#E5EAF0] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.1)]">
      {children}
    </div>
  );
}

function RowDivider() {
  return <div className="mx-4 border-t border-[#EEF2F6]" />;
}

function NavRow({
  icon,
  label,
  onClick,
  to,
  external,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  to?: string;
  external?: string;
  disabled?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-3.5 px-4 py-4 text-left transition-colors",
    disabled ? "cursor-not-allowed opacity-45" : "active:bg-[#F8FAFC]",
  );
  const inner = (
    <>
      <IconBubble>{icon}</IconBubble>
      <span className="min-w-0 flex-1 text-[16px] font-bold text-[#0F172A]">{label}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#94A3B8]" />
    </>
  );

  if (disabled) {
    return (
      <div className={className} aria-disabled="true">
        {inner}
      </div>
    );
  }
  if (external) {
    return (
      <a href={external} target="_blank" rel="noreferrer" className={className} onClick={onClick}>
        {inner}
      </a>
    );
  }
  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  );
}

export default function ParentMobileSidebar({
  user,
  onClose,
}: {
  user: SessionUser;
  onClose: () => void;
}) {
  const photo = user.profileImage ? resolveUploadUrl(user.profileImage) : "";
  const profileHref = moduleHref("parent", "settings");

  return (
    <div className="flex h-full flex-col bg-[#F4F6F8]">
      <header className="relative shrink-0 overflow-hidden bg-gradient-to-b from-[#3B82F6] via-[#22C5D6] to-[#14B8C8] px-5 pb-8 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="pointer-events-none absolute -left-10 top-6 h-36 w-36 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -right-8 -top-6 h-40 w-40 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute right-10 top-24 h-20 w-20 rounded-full border border-white/10" />

        <SheetClose asChild>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            aria-label="Close menu"
            className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-30 grid h-10 w-10 place-items-center rounded-full bg-white/20 text-white shadow-sm"
          >
            <X className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </SheetClose>

        <div className="relative z-10 flex flex-col items-center pt-4">
          <span className="grid h-[72px] w-[72px] place-items-center overflow-hidden rounded-full border-[3px] border-white/40 bg-white/15 shadow-md">
            {photo ? (
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-9 w-9 text-white/95" strokeWidth={1.5} />
            )}
          </span>
          <h2 className="mt-3 max-w-[90%] truncate text-center text-[26px] font-extrabold leading-tight tracking-tight">
            {user.name || "Parent"}
          </h2>
          <span className="mt-2 rounded-full bg-[#14B8A6] px-3.5 py-1 text-[13px] font-bold text-white shadow-sm">
            Parent
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <section>
          <SectionLabel>Account</SectionLabel>
          <MenuCard>
            <NavRow
              icon={<User className="h-[18px] w-[18px]" strokeWidth={2} />}
              label="My Profile"
              to={profileHref}
              onClick={onClose}
            />
          </MenuCard>
        </section>

        <section>
          <SectionLabel>Preferences</SectionLabel>
          <MenuCard>
            <div className="flex items-center gap-3.5 px-4 py-4 opacity-45">
              <IconBubble>
                <Moon className="h-[18px] w-[18px]" strokeWidth={2} />
              </IconBubble>
              <span className="min-w-0 flex-1 text-[16px] font-bold text-[#0F172A]">Dark Mode</span>
              <Switch
                checked={false}
                disabled
                aria-label="Toggle dark mode"
                className={cn(
                  "h-[26px] w-[46px] cursor-not-allowed data-[state=checked]:bg-[#22C5D6] data-[state=unchecked]:bg-[#CBD5E1]",
                  "[&>span]:h-[22px] [&>span]:w-[22px] data-[state=checked]:[&>span]:translate-x-[20px]",
                )}
              />
            </div>
          </MenuCard>
        </section>

        <section>
          <SectionLabel>Support & More</SectionLabel>
          <MenuCard>
            <NavRow
              icon={<Share2 className="h-[18px] w-[18px]" strokeWidth={2} />}
              label="Share App"
              disabled
            />
            <RowDivider />
            <NavRow
              icon={<ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2} />}
              label="Privacy Policy"
              disabled
            />
            <RowDivider />
            <NavRow
              icon={<Facebook className="h-[18px] w-[18px]" strokeWidth={2} />}
              label="Facebook Rate Us"
              disabled
            />
          </MenuCard>
        </section>

        <section>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-3.5 rounded-[22px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-4 text-left shadow-[0_10px_28px_rgba(15,23,42,0.08)] transition-colors active:bg-[#FCDADA]"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FECACA] text-[#DC2626]">
              <LogOut className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </span>
            <span className="text-[16px] font-bold text-[#DC2626]">Logout</span>
          </button>
        </section>
      </div>
    </div>
  );
}
