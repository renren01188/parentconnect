"use client";

import React from "react";
import { ArrowRight, LucideIcon } from "lucide-react";

interface LoginCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonLabel: string;
  buttonColor: string;
  buttonStyle?: React.CSSProperties;
  iconBg: string;
  iconStyle?: React.CSSProperties;
  href?: string;
  onClick?: () => void;
}

export default function LoginCard({
  icon: Icon,
  title,
  description,
  buttonLabel,
  buttonColor,
  buttonStyle,
  iconBg,
  iconStyle,
  href = "#",
  onClick,
}: LoginCardProps) {
  return (
    <div className="group relative bg-white rounded-2xl shadow-md hover:shadow-xl border border-slate-100 p-6 flex flex-col transition-all duration-300 hover:-translate-y-1">
      {/* Icon */}
      <div
        className={`w-14 h-14 rounded-2xl ${iconBg} flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110`}
        style={iconStyle}
      >
        <Icon className="w-7 h-7 text-white" />
      </div>

      {/* Title */}
      <h3 className="text-slate-800 font-bold text-lg mb-2">{title}</h3>

      {/* Description */}
      <p className="text-slate-500 text-sm leading-relaxed flex-1 mb-6">
        {description}
      </p>

      {/* Button */}
      <a
        href={href}
        onClick={onClick}
        className={`
          flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl
          font-semibold text-sm text-white transition-all duration-200
          hover:gap-3 active:scale-95 ${buttonColor}
        `}
        style={buttonStyle}
      >
        {buttonLabel}
        <ArrowRight className="w-4 h-4" />
      </a>
    </div>
  );
}