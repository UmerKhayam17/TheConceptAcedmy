import { Link } from "react-router-dom";
import { ChevronDown, LogOut, User, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SessionUser } from "@/lib/auth";
import { logout } from "@/lib/auth";
import { resolveUploadUrl } from "@/lib/api";
import { moduleHref } from "@/lib/panelMenus";
import { cn } from "@/lib/utils";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function roleLabel(role: string): string {
  if (!role) return "User";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function UserAvatarBadge({
  user,
  className,
  size = "md",
  accent = "navy",
}: {
  user: Pick<SessionUser, "name" | "profileImage">;
  className?: string;
  size?: "sm" | "md" | "header";
  /** Bright blue circle + user glyph (portal page headers). */
  accent?: "navy" | "blue";
}) {
  const src = user.profileImage ? resolveUploadUrl(user.profileImage) : undefined;
  const sizeClass =
    size === "header" ? "h-9 w-9" : size === "sm" ? "h-8 w-8" : "h-9 w-9";

  return (
    <Avatar
      className={cn(
        sizeClass,
        accent === "blue"
          ? "border-0 bg-[#1769E0] text-white"
          : "border border-border/80 bg-primary/10 text-primary",
        className,
      )}
    >
      {src ? <AvatarImage src={src} alt={user.name} className="object-cover" /> : null}
      <AvatarFallback
        className={cn(
          accent === "blue"
            ? "bg-[#1769E0] text-white"
            : "bg-primary text-[11px] font-semibold text-primary-foreground",
        )}
      >
        {accent === "blue" ? (
          <User className="h-4 w-4" aria-hidden />
        ) : (
          initialsFromName(user.name)
        )}
      </AvatarFallback>
    </Avatar>
  );
}

export default function PanelUserMenu({
  user,
  variant = "default",
}: {
  user: SessionUser;
  /** `portal` matches Subject Teachers / admin portal page headers. */
  variant?: "default" | "portal";
}) {
  const profileHref = moduleHref(user.role, "settings");
  const portal = variant === "portal";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 sm:pr-2",
            "outline-none transition-all duration-150 ease-out",
            portal
              ? "hover:bg-[#EEF5FF] focus-visible:ring-2 focus-visible:ring-[#1769E0]/35 focus-visible:ring-offset-0"
              : "hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          aria-label="Account menu"
        >
          <UserAvatarBadge
            user={user}
            size={portal ? "header" : "sm"}
            accent={portal ? "blue" : "navy"}
          />
          {portal ? (
            <span className="hidden text-[13px] font-semibold capitalize text-[#10244A] sm:inline">
              {roleLabel(user.role)}
            </span>
          ) : (
            <span className="hidden min-w-0 max-w-[9rem] flex-col items-start leading-tight md:flex">
              <span className="truncate text-xs font-semibold text-foreground">{user.name}</span>
              <span className="truncate text-[10px] capitalize text-muted-foreground">{user.role}</span>
            </span>
          )}
          <ChevronDown
            className={cn(
              "hidden h-3.5 w-3.5 sm:block",
              portal ? "text-[#10244A]" : "text-muted-foreground",
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2.5 py-0.5">
            <UserAvatarBadge user={user} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={profileHref} className="cursor-pointer">
            <UserRound className="mr-2 h-4 w-4" />
            View profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={() => void logout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
