type UserAvatarProps = {
  name: string;
  className?: string;
  fallbackClassName?: string;
  label?: string;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

/** A single, non-uploadable initials avatar treatment for message threads. */
export function UserAvatar({ name, className = "", fallbackClassName = "bg-slate-500", label }: UserAvatarProps) {
  return (
    <div aria-label={label ?? `${name}'s avatar`} className={`${className} ${fallbackClassName} flex shrink-0 items-center justify-center overflow-hidden text-xs font-extrabold text-white`}>
      {initials(name)}
    </div>
  );
}
