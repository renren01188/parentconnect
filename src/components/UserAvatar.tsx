"use client";

import { useEffect, useState } from "react";

type UserAvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
  label?: string;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

/** A single avatar treatment for message threads, with a safe initials fallback. */
export function UserAvatar({ name, src, className = "", fallbackClassName = "bg-slate-500", label }: UserAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);

  useEffect(() => setFailedSource(null), [src]);

  return (
    <div className={`${className} ${fallbackClassName} flex shrink-0 items-center justify-center overflow-hidden text-xs font-extrabold text-white`}>
      {src && failedSource !== src
        ? <img src={src} alt={label ?? `${name}'s profile`} className="h-full w-full object-cover" onError={() => setFailedSource(src)} />
        : initials(name)}
    </div>
  );
}
