/**
 * Chat REST API + React Query cache + socket realtime helpers.
 */
import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiRoot, parseJson } from "@/lib/api";
import { authedFetch, ensureAccessToken } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import socketService from "@/services/socket/socket.service";

export const chatKeys = {
  conversations: ["chat", "conversations"],
  messages: (conversationId) => ["chat", "messages", conversationId],
};

/* ── Types ──────────────────────────────────────────────────────────────────
 * Chat documents come straight from the backend and gain fields over time,
 * so they're typed loosely: a required `_id` plus any other fields.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChatDoc = { _id: string; [key: string]: any };
export type Conversation = ChatDoc;
export type ChatMessage = ChatDoc;
export type ChatUser = ChatDoc;

export type MessagesBucket = { messages: ChatMessage[]; hasMore: boolean; loading?: boolean };

/** Shape of every chat REST response (each endpoint fills in the fields it uses). */
export type ChatResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  conversation?: Conversation;
  conversations?: Conversation[];
  messages?: ChatMessage[];
  hasMore?: boolean;
  users?: ChatUser[];
  media?: ChatDoc[];
  file?: ChatDoc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export class ChatApiError extends Error {
  status?: number;
  data?: unknown;
}

export function userIdStr(id) {
  if (!id) return "";
  return String(id._id || id);
}

async function chatFetch(path: string, options: RequestInit = {}): Promise<ChatResponse> {
  const res = await authedFetch(path, options);
  const data = (await parseJson(res)) as ChatResponse;
  if (!res.ok) {
    const err = new ChatApiError(data?.error || data?.message || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const api = {
  searchUsers: (q, limit?: number) =>
    chatFetch(`/chat/users/search?q=${encodeURIComponent(q || "")}${limit ? `&limit=${limit}` : ""}`),
  getConversations: () => chatFetch("/chat/conversations"),
  getConversation: (id) => chatFetch(`/chat/conversations/${id}`),
  getOrCreateDirect: (targetUserId) => chatFetch(`/chat/conversations/direct/${targetUserId}`),
  createGroup: (body: { title: string; participantIds: string[]; [key: string]: unknown }) =>
    chatFetch("/chat/conversations/group", { method: "POST", body: JSON.stringify(body) }),
  updateGroup: (id, body) =>
    chatFetch(`/chat/conversations/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  updateGroupSettings: (id, settings) =>
    chatFetch(`/chat/conversations/${id}/settings`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  addParticipants: (id, userIds) =>
    chatFetch(`/chat/conversations/${id}/participants`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),
  removeParticipant: (convId, userId) =>
    chatFetch(`/chat/conversations/${convId}/participants/${userId}`, { method: "DELETE" }),
  changeParticipantRole: (convId, targetUserId, role) =>
    chatFetch(`/chat/conversations/${convId}/participants/${targetUserId}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  leaveGroup: (convId, newAdminId = null) =>
    chatFetch(`/chat/conversations/${convId}/leave`, {
      method: "DELETE",
      body: JSON.stringify(newAdminId ? { newAdminId } : {}),
    }),
  deleteGroup: (convId) => chatFetch(`/chat/conversations/${convId}`, { method: "DELETE" }),
  getMessages: (conversationId, params: { before?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.before) qs.set("before", params.before);
    if (params.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return chatFetch(
      `/chat/conversations/${conversationId}/messages${q ? `?${q}` : ""}`
    );
  },
  searchMessages: (conversationId, q) =>
    chatFetch(
      `/chat/conversations/${conversationId}/messages/search?q=${encodeURIComponent(q)}`
    ),
  getMedia: (conversationId, type = "image") =>
    chatFetch(`/chat/conversations/${conversationId}/media?type=${type}`),
  pinMessage: (conversationId, messageId) =>
    chatFetch(`/chat/conversations/${conversationId}/messages/${messageId}/pin`, {
      method: "POST",
    }),
  uploadFile: async (file, conversationId, onProgress): Promise<ChatResponse> => {
    const form = new FormData();
    form.append("chat_file", file);
    form.append("conversationId", conversationId);
    const token = await ensureAccessToken();
    return new Promise<ChatResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${getApiRoot()}/chat/upload`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.round((e.loaded * 100) / e.total));
      };
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) {
            if (!data?.file) reject(new Error(data?.error || "Upload failed"));
            else resolve(data);
          } else reject(new Error(data?.error || "Upload failed"));
        } catch {
          reject(new Error("Upload failed"));
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(form);
    });
  },
};

export default api;

// ── UI context (active conversation, typing, presence) ─────────────────────

const ChatUiContext = createContext(null);

export function ChatUiProvider({ children }) {
  const { user } = useAuth();
  const myId = user?.id || null;
  const [activeId, setActiveId] = useState(null);
  const [presenceMap, setPresenceMap] = useState({});
  const [typingMap, setTypingMap] = useState({});

  const setTyping = useCallback((conversationId, users) => {
    setTypingMap((prev) => ({ ...prev, [conversationId]: users || [] }));
  }, []);

  const setPresence = useCallback((userId, status) => {
    const key = String(userId);
    setPresenceMap((prev) => ({
      ...prev,
      [key]: { status, lastSeenAt: status === "offline" ? new Date() : undefined },
    }));
  }, []);

  return createElement(
    ChatUiContext.Provider,
    {
      value: {
        myId,
        activeId,
        setActiveId,
        presenceMap,
        typingMap,
        setTyping,
        setPresence,
      },
    },
    children
  );
}

export function useChatUi() {
  const ctx = useContext(ChatUiContext);
  if (!ctx) throw new Error("useChatUi must be used inside ChatUiProvider");
  return ctx;
}

// ── Query hooks ────────────────────────────────────────────────────────────

export function useConversations() {
  return useQuery({
    queryKey: chatKeys.conversations,
    queryFn: async () => {
      const res = await api.getConversations();
      return res.conversations || [];
    },
  });
}

export function useConversation(conversationId) {
  const { data: list = [] } = useConversations();
  return list.find((c) => String(c._id) === String(conversationId)) || null;
}

export function useMessages(conversationId) {
  return useQuery({
    queryKey: chatKeys.messages(conversationId),
    enabled: !!conversationId,
    queryFn: async (): Promise<MessagesBucket> => {
      const res = await api.getMessages(conversationId);
      return { messages: res.messages || [], hasMore: !!res.hasMore };
    },
  });
}

export async function fetchOlderMessages(queryClient, conversationId, before) {
  const res = await api.getMessages(conversationId, { before });
  const older = res.messages || [];
  queryClient.setQueryData(chatKeys.messages(conversationId), (prev) => {
    if (!prev) return { messages: older, hasMore: !!res.hasMore };
    const ids = new Set(prev.messages.map((m) => String(m._id)));
    const merged = [...older.filter((m) => !ids.has(String(m._id))), ...prev.messages];
    return { messages: merged, hasMore: !!res.hasMore };
  });
  return res;
}

export function patchConversations(queryClient, updater) {
  queryClient.setQueryData(chatKeys.conversations, (prev) => {
    const list = Array.isArray(prev) ? prev : [];
    return updater(list);
  });
}

export function clearUnread(queryClient, conversationId, myId) {
  patchConversations(queryClient, (list) =>
    list.map((c) => {
      if (String(c._id) !== String(conversationId)) return c;
      return {
        ...c,
        myUnreadCount: 0,
        participants: (c.participants || []).map((p) => {
          const uid = p.userId?._id || p.userId;
          if (String(uid) !== String(myId)) return p;
          return { ...p, unreadCount: 0 };
        }),
      };
    })
  );
}

export function prependConversation(queryClient, conv) {
  patchConversations(queryClient, (list) => {
    const filtered = list.filter((c) => String(c._id) !== String(conv._id));
    return [conv, ...filtered];
  });
}

export function updateMessageInCache(queryClient, conversationId, messageId, updates) {
  queryClient.setQueryData(chatKeys.messages(conversationId), (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      messages: prev.messages.map((m) =>
        String(m._id) === String(messageId) ? { ...m, ...updates } : m
      ),
    };
  });
}

export function removeMessageFromCache(queryClient, conversationId, messageId) {
  queryClient.setQueryData(chatKeys.messages(conversationId), (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      messages: prev.messages.filter((m) => String(m._id) !== String(messageId)),
    };
  });
}

export function appendMessage(queryClient, conversationId, message) {
  queryClient.setQueryData(chatKeys.messages(conversationId), (prev) => {
    if (!prev) return { messages: [message], hasMore: false };
    if (prev.messages.some((m) => String(m._id) === String(message._id))) return prev;
    return { ...prev, messages: [...prev.messages, message] };
  });
}

export function updateConversationMeta(queryClient, conversationId, patch) {
  patchConversations(queryClient, (list) =>
    list.map((c) => (String(c._id) === String(conversationId) ? { ...c, ...patch } : c))
  );
}

export function useGetOrCreateDirect() {
  const qc = useQueryClient();
  const { setActiveId } = useChatUi();
  return useMutation({
    mutationFn: (targetUserId) => api.getOrCreateDirect(targetUserId),
    onSuccess: (res) => {
      const conv = res.conversation;
      if (conv) {
        prependConversation(qc, conv);
        setActiveId(conv._id);
        socketService.joinConversation(conv._id);
      }
    },
  });
}

export function useCreateGroup() {
  const qc = useQueryClient();
  const { setActiveId } = useChatUi();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createGroup>[0]) => api.createGroup(body),
    onSuccess: (res) => {
      const conv = res.conversation;
      if (conv) {
        prependConversation(qc, conv);
        setActiveId(conv._id);
        socketService.joinConversation(conv._id);
        qc.invalidateQueries({ queryKey: chatKeys.conversations });
      }
    },
  });
}

export function useChatMutations() {
  const qc = useQueryClient();
  const { setActiveId } = useChatUi();

  return {
    addParticipants: useMutation({
      mutationFn: ({ conversationId, userIds }: { conversationId: string; userIds: string[] }) =>
        api.addParticipants(conversationId, userIds),
      onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations }),
    }),
    removeParticipant: useMutation({
      mutationFn: ({ conversationId, targetUserId }: { conversationId: string; targetUserId: string }) =>
        api.removeParticipant(conversationId, targetUserId),
      onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations }),
    }),
    changeParticipantRole: useMutation({
      mutationFn: ({
        conversationId,
        targetUserId,
        role,
      }: {
        conversationId: string;
        targetUserId: string;
        role: string;
      }) => api.changeParticipantRole(conversationId, targetUserId, role),
      onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.conversations }),
    }),
    leaveGroup: useMutation({
      mutationFn: ({ conversationId, newAdminId }: { conversationId: string; newAdminId?: string | null }) =>
        api.leaveGroup(conversationId, newAdminId),
      onSuccess: (_res, { conversationId }) => {
        patchConversations(qc, (list) => list.filter((c) => String(c._id) !== String(conversationId)));
        setActiveId(null);
      },
    }),
    deleteGroup: useMutation({
      mutationFn: (conversationId) => api.deleteGroup(conversationId),
      onSuccess: (_res, conversationId) => {
        patchConversations(qc, (list) => list.filter((c) => String(c._id) !== String(conversationId)));
        setActiveId(null);
      },
    }),
  };
}

// ── Socket realtime ──────────────────────────────────────────────────────────

export function useChatSocket() {
  const qc = useQueryClient();
  const { myId, setTyping, setPresence } = useChatUi();

  useEffect(() => {
    let cancelled = false;
    let chat: typeof socketService.chat | null = null;

    const cleanup = () => {
      if (!chat) return;
      chat.off("conversation:new", onConvNew);
      chat.off("message:new", onNew);
      chat.off("message:edited", onEdit);
      chat.off("message:deleted", onDeleted);
      chat.off("message:seen", onSeen);
      chat.off("conversation:updated", onConvUpdated);
      chat.off("typing:update", onTyping);
      chat.off("presence:update", onPresence);
      chat.off("reaction:updated", onReaction);
    };

    const onConvNew = (conv) => {
      if (conv?._id) {
        prependConversation(qc, conv);
        socketService.joinConversation(conv._id);
      } else {
        qc.invalidateQueries({ queryKey: chatKeys.conversations });
      }
    };

    const onNew = (message) => {
      const cid = message.conversationId?._id || message.conversationId;
      appendMessage(qc, cid, message);
      patchConversations(qc, (list) => {
        const idx = list.findIndex((c) => String(c._id) === String(cid));
        if (idx < 0) {
          qc.invalidateQueries({ queryKey: chatKeys.conversations });
          return list;
        }
        const conv = { ...list[idx] };
        conv.lastMessageAt = message.createdAt;
        conv.lastMessagePreview = message.text || `[${message.type}]`;
        conv.lastMessageId = message;
        const next = [...list];
        next.splice(idx, 1);
        next.unshift(conv);
        return next;
      });
    };

    const onEdit = (payload) => {
      const cid = payload.conversationId?._id || payload.conversationId;
      const mid = payload.messageId || payload._id;
      if (!cid || !mid) return;
      const updates: Record<string, unknown> = { isEdited: true };
      if (payload.newText !== undefined) updates.text = payload.newText;
      if (payload.editedAt) updates.editedAt = payload.editedAt;
      updateMessageInCache(qc, cid, mid, updates);
    };

    const onDeleted = ({ conversationId, messageId, deletedForEveryone }) => {
      if (deletedForEveryone) {
        updateMessageInCache(qc, conversationId, messageId, { deletedForEveryone: true });
      } else {
        removeMessageFromCache(qc, conversationId, messageId);
      }
    };

    const onSeen = ({ conversationId, messageId, status }) => {
      updateMessageInCache(qc, conversationId, messageId, { status });
    };

    const onConvUpdated = (patch) => {
      if (patch?.conversationId) {
        const { conversationId, ...rest } = patch;
        updateConversationMeta(qc, conversationId, rest);
      } else {
        qc.invalidateQueries({ queryKey: chatKeys.conversations });
      }
    };

    const onTyping = ({ conversationId, users }) => {
      setTyping(conversationId, users);
    };

    const onPresence = ({ userId, status }) => {
      setPresence(userId, status);
    };

    const onReaction = ({ conversationId, messageId, reactions }) => {
      updateMessageInCache(qc, conversationId, messageId, { reactions });
    };

    void (async () => {
      const token = await ensureAccessToken();
      if (!token || cancelled) return;

      socketService.connect(token);
      chat = socketService.chat;
      if (!chat || cancelled) return;

      chat.on("conversation:new", onConvNew);
      chat.on("message:new", onNew);
      chat.on("message:edited", onEdit);
      chat.on("message:deleted", onDeleted);
      chat.on("message:seen", onSeen);
      chat.on("conversation:updated", onConvUpdated);
      chat.on("typing:update", onTyping);
      chat.on("presence:update", onPresence);
      chat.on("reaction:updated", onReaction);
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [qc, setTyping, setPresence]);
}

// ── Typing + intersection helpers (used by message UI) ───────────────────────

export function useTyping(conversationId) {
  const debounceRef = useRef(null);
  const activeRef = useRef(false);

  const stop = useCallback(() => {
    if (!conversationId || !activeRef.current) return;
    activeRef.current = false;
    socketService.stopTyping(conversationId);
  }, [conversationId]);

  const onInput = useCallback(() => {
    if (!conversationId) return;
    if (!activeRef.current) {
      activeRef.current = true;
      socketService.startTyping(conversationId);
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(stop, 2000);
  }, [conversationId, stop]);

  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    stop();
  }, [stop]);

  return { onInput, stop };
}

export function useIntersection(callback) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !callback) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) callback();
      },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [callback]);
  return ref;
}

// ── Smart jump (load older pages until message found) ────────────────────────

export function useSmartJump(conversationId, jumpToMessage) {
  const qc = useQueryClient();
  const { data: bucket } = useMessages(conversationId);
  const [jumping, setJumping] = useState(false);
  const bucketRef = useRef(bucket);
  useEffect(() => {
    bucketRef.current = bucket;
  }, [bucket]);

  const smartJump = useCallback(
    async (messageId) => {
      if (!messageId) return;
      setJumping(true);
      const isLoaded = () =>
        (bucketRef.current?.messages || []).some((m) => String(m._id) === String(messageId));

      if (isLoaded()) {
        setJumping(false);
        jumpToMessage(messageId);
        return;
      }

      let attempts = 0;
      while (attempts < 20) {
        const current = bucketRef.current;
        if (!current?.hasMore) break;
        const oldest = current.messages?.[0];
        if (!oldest) break;
        await fetchOlderMessages(qc, conversationId, oldest.createdAt);
        await new Promise((r) => setTimeout(r, 50));
        bucketRef.current = qc.getQueryData(chatKeys.messages(conversationId));
        if (isLoaded()) break;
        attempts += 1;
      }

      setJumping(false);
      if (isLoaded()) jumpToMessage(messageId);
    },
    [conversationId, jumpToMessage, qc]
  );

  return { smartJump, jumping };
}
