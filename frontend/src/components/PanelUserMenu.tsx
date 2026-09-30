import { Link } from "react-router-dom";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
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

export function UserAvatarBadge({
  user,
  className,
  size = "md",
}: {
  user: Pick<SessionUser, "name" | "profileImage">;
  className?: string;
  size?: "sm" | "md";
}) {
  const src = user.profileImage ? resolveUploadUrl(user.profileImage) : undefined;
  return (
    <Avatar
      className={cn(
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        "border border-border/80 bg-primary/10 text-primary",
        className,
      )}
    >
      {src ? <AvatarImage src={src} alt={user.name} className="object-cover" /> : null}
      <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
        {initialsFromName(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export default function PanelUserMenu({ user }: { user: SessionUser }) {
  const profileHref = moduleHref(user.role, "settings");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 sm:pr-2",
            "outline-none transition-colors hover:bg-muted/70",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          )}
          aria-label="Account menu"
        >
          <UserAvatarBadge user={user} size="sm" />
          <span className="hidden min-w-0 max-w-[9rem] flex-col items-start leading-tight md:flex">
            <span className="truncate text-xs font-semibold text-foreground">{user.name}</span>
            <span className="truncate text-[10px] capitalize text-muted-foreground">{user.role}</span>
          </span>
          <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
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
