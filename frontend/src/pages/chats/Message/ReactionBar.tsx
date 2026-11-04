/**
 * components/Message/ReactionBar.jsx
 * WhatsApp-exact reaction pill style
 */

import React from "react";

type ReactionGroup = { emoji: string; count: number; users: string[]; isMine: boolean };

export default function ReactionBar({ reactions, myId, onToggle }) {
  const grouped: Record<string, ReactionGroup> = reactions.reduce((acc: Record<string, ReactionGroup>, r) => {
    const key = r.emoji;
    if (!acc[key]) acc[key] = { emoji: key, count: 0, users: [], isMine: false };
    acc[key].count++;
    acc[key].users.push(r.userId?.name || "Someone");
    if (r.userId?._id === myId || r.userId === myId) acc[key].isMine = true;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap gap-[3px] mt-[3px]">
      {Object.values(grouped).map((g) => (
        <button
          key={g.emoji}
          onClick={() => onToggle(g.emoji)}
          title={g.users.join(", ")}
          className="flex items-center gap-[3px] text-[12px] rounded-full px-[7px] py-[2px] transition-colors"
          style={{
            background: g.isMine ? "rgba(0,168,132,0.15)" : "rgba(255,255,255,0.85)",
            border: `1px solid ${g.isMine ? "#00a884" : "#d1d7db"}`,
            color: g.isMine ? "#00a884" : "#3b4a54",
            boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
          }}
        >
          <span className="text-[13px] leading-none">{g.emoji}</span>
          <span className="font-semibold tabular-nums">{g.count}</span>
        </button>
      ))}
    </div>
  );
}