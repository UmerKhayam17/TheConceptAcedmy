import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Search, X } from "lucide-react";
import api, {
  clearUnread,
  useChatUi,
  useConversations,
  useGetOrCreateDirect,
  userIdStr,
} from "@/services/socket/chat.api";
import socketService from "@/services/socket/socket.service";
import { useQueryClient } from "@tanstack/react-query";
import ParentChildSelectBanner, {
  conversationBelongsToChild,
  useParentSelectedChild,
} from "@/components/modules/parent/ParentChildSelectBanner";
import { cn } from "@/lib/utils";

type StaffUser = {
  _id: string;
  name?: string;
  designation?: string;
  roleName?: string;
  role?: { name?: string } | string;
  profile_image?: string;
  profileImage?: string;
  onlineStatus?: string;
};

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function roleKey(user: { designation?: string; roleName?: string; role?: { name?: string } | string }) {
  const designation = String(user.designation || "").trim();
  if (designation) return designation;
  const raw = user.roleName || (typeof user.role === "object" ? user.role?.name : "") || "";
  const labels: Record<string, string> = {
    admin: "Admin",
    teacher: "Teacher",
    accountant: "Accounts",
    non_teaching_staff: "Staff",
  };
  return labels[raw] || "Staff";
}

function shortDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function MintAvatar({ name, online }: { name: string; online?: boolean }) {
  return (
    <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#DDF5D8] text-sm font-bold text-[#3D8C40]">
      {initials(name)}
      {online ? (
        <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#22C55E]" />
      ) : null}
    </span>
  );
}

export default function ParentMobileChats() {
  const qc = useQueryClient();
  const { myId, setActiveId } = useChatUi();
  const { data: list = [], isLoading } = useConversations();
  const [search, setSearch] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { selected, children } = useParentSelectedChild();

  const siblingNames = children.map((child) => child.studentName || "");
  const childName = selected?.studentName || "";

  const childScoped = useMemo(
    () =>
      list.filter((conversation) =>
        conversationBelongsToChild(conversation, childName, siblingNames),
      ),
    [list, childName, siblingNames],
  );

  const unreadTotal = childScoped.reduce((sum, conversation) => {
    const mine = conversation.participants?.find(
      (participant) => userIdStr(participant.userId) === userIdStr(myId),
    );
    return sum + (Number(mine?.unreadCount) || 0);
  }, 0);

  const filtered = childScoped.filter((conversation) => {
    const other = conversation.participants?.find(
      (participant) => userIdStr(participant.userId) !== userIdStr(myId),
    );
    const name = conversation.type === "group"
      ? conversation.title
      : other?.userId?.name || "";
    const preview = conversation.lastMessagePreview || "";
    const title = roleKey(other?.userId || {});
    const hay = `${name} ${preview} ${title}`.toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

  const openConversation = (conversation) => {
    setActiveId(conversation._id);
    clearUnread(qc, conversation._id, myId);
    socketService.joinConversation(conversation._id);
    socketService.markRead(conversation._id);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#E7F4FB]">
      <header className="px-4 pb-2 pt-[max(0.85rem,env(safe-area-inset-top))]">
        <h1 className="flex items-center justify-center gap-2 text-[22px] font-extrabold tracking-tight text-[#111827]">
          Chats
          {unreadTotal > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#F43F5E] px-1.5 text-[11px] font-bold text-white">
              {unreadTotal > 9 ? "9+" : unreadTotal}
            </span>
          ) : null}
        </h1>
      </header>

      <ParentChildSelectBanner className="mb-3" />

      <div className="px-4">
        <label className="flex h-11 items-center gap-2 rounded-xl bg-white px-3 text-slate-400 shadow-sm">
          <Search className="h-4 w-4 shrink-0" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, class, message..."
            className="w-full bg-transparent text-sm text-[#17324A] outline-none placeholder:text-slate-400"
          />
        </label>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-[#12C2D4] text-sm font-semibold text-white shadow-sm"
        >
          + New Chat
        </button>
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 pb-4">
        {isLoading ? <div className="h-20 animate-pulse rounded-2xl bg-white/70" /> : null}
        {!isLoading && filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-500">
            {search.trim()
              ? "No matching chats."
              : `No chats for ${selected?.studentName || "this student"} yet. Start one with school staff.`}
          </p>
        ) : null}
        {filtered.map((conversation) => {
          const other = conversation.participants?.find(
            (participant) => userIdStr(participant.userId) !== userIdStr(myId),
          );
          const person = other?.userId || {};
          const name = conversation.type === "group" ? conversation.title || "Group" : person.name || "Staff";
          const mine = conversation.participants?.find(
            (participant) => userIdStr(participant.userId) === userIdStr(myId),
          );
          const unread = Number(mine?.unreadCount) || 0;
          return (
            <button
              key={conversation._id}
              type="button"
              onClick={() => openConversation(conversation)}
              className="flex w-full items-center gap-3 rounded-2xl border-l-4 border-[#22C55E] bg-white px-3 py-3 text-left shadow-sm"
            >
              <MintAvatar name={name} online={person.onlineStatus === "online"} />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-[#17324A]">{name}</span>
                    <span className="rounded-full bg-[#E5F8E8] px-2 py-0.5 text-[10px] font-semibold text-[#3D8C40]">
                      Staff
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{shortDate(conversation.lastMessageAt)}</span>
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{roleKey(person)}</span>
                <span className={cn("mt-0.5 block truncate text-xs", unread ? "font-medium text-[#17324A]" : "text-slate-400")}>
                  {conversation.lastMessagePreview || "No messages yet"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {sheetOpen ? <NewChatSheet onClose={() => setSheetOpen(false)} /> : null}
    </div>
  );
}

function NewChatSheet({ onClose }: { onClose: () => void }) {
  const getOrCreate = useGetOrCreateDirect();
  const [query, setQuery] = useState("");
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api.searchUsers(query, 80)
        .then((res) => {
          if (!cancelled) setStaff(res.users || []);
        })
        .catch(() => {
          if (!cancelled) setStaff([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter((person) =>
      `${person.name || ""} ${roleKey(person)}`.toLowerCase().includes(q),
    );
  }, [staff, query]);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/35">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[86dvh] w-full flex-col rounded-t-[28px] bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="flex justify-center pt-2">
          <span className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-start justify-between px-5 pb-2 pt-3">
          <div>
            <h2 className="text-lg font-bold text-[#17324A]">+ New Chat</h2>
            <p className="text-xs text-slate-400">Select a staff member to message</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close new chat"
            className="grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-3">
          <label className="flex h-11 items-center gap-2 rounded-xl bg-[#F4F7FB] px-3 text-slate-400">
            <Search className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search staff or parents..."
              className="w-full bg-transparent text-sm text-[#17324A] outline-none placeholder:text-slate-400"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <p className="text-[11px] font-bold tracking-[0.14em] text-[#64748B]">SCHOOL STAFF</p>
          <p className="mb-2 mt-3 text-[10px] font-semibold tracking-[0.16em] text-[#94A3B8]">APP INSTALLED</p>
          {loading ? <p className="py-6 text-sm text-slate-400">Loading staff…</p> : null}
          {!loading && visible.length === 0 ? (
            <p className="py-6 text-sm text-slate-400">No staff found.</p>
          ) : null}
          <ul>
            {visible.map((person) => (
              <li key={person._id} className="flex items-center gap-3 border-b border-[#F1F5F9] py-3">
                <MintAvatar name={person.name || "Staff"} online={person.onlineStatus === "online"} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-[#17324A]">{person.name}</p>
                    <span className="rounded-full bg-[#E5F8E8] px-2 py-0.5 text-[10px] font-semibold text-[#3D8C40]">
                      Staff
                    </span>
                    <span className="rounded-full bg-[#E5F8E8] px-2 py-0.5 text-[10px] font-semibold text-[#3D8C40]">
                      Active
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-400">{roleKey(person)} · Staff</p>
                </div>
                <button
                  type="button"
                  aria-label={`Message ${person.name}`}
                  disabled={getOrCreate.isPending}
                  onClick={() => {
                    getOrCreate.mutate(person._id);
                    onClose();
                  }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#12C2D4] text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
