/**
 * components/Shared/UserAvatar.jsx
 * Renders a user/group avatar with fallback initials.
 */

import React from "react";
import { Users } from "lucide-react";

const COLORS = [
  "bg-red-400",    "bg-orange-400", "bg-amber-400",
  "bg-yellow-400", "bg-lime-500",   "bg-green-500",
  "bg-teal-500",   "bg-cyan-500",   "bg-sky-500",
  "bg-blue-500",   "bg-indigo-500", "bg-violet-500",
  "bg-purple-500", "bg-fuchsia-500","bg-pink-500",
];

function getColor(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return COLORS[hash % COLORS.length];
}

function getInitials(name = "") {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function UserAvatar({ name, avatarUrl, size = 40, isGroup = false }) {
  const style = { width: size, height: size, minWidth: size, minHeight: size };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={style}
        className="rounded-full object-cover"
        onError={(e) => {
          const img = e.currentTarget;
          img.onerror = null;
          img.style.display = "none";
        }}
      />
    );
  }

  if (isGroup) {
    return (
      <div
        style={style}
        className="rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0"
      >
        <Users size={size * 0.44} className="text-gray-500" />
      </div>
    );
  }

  const color    = getColor(name);
  const initials = getInitials(name);
  const fontSize = Math.max(size * 0.38, 10);

  return (
    <div
      style={{ ...style, fontSize }}
      className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${color}`}
    >
      {initials}
    </div>
  );
}