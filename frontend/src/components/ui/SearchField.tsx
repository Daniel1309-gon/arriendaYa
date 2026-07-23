import React from 'react';

interface SearchFieldProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SearchField({ label, icon, children, className = '' }: SearchFieldProps) {
  return (
    <div className={`w-full flex items-center gap-2 px-4 py-3 md:py-2 ${className}`}>
      <div className="text-emerald-700 shrink-0">
        {icon}
      </div>
      <div className="text-left w-full flex flex-col justify-center">
        <label className="block text-[10px] uppercase text-slate-500 font-bold leading-none mb-1">
          {label}
        </label>
        {children}
      </div>
    </div>
  );
}
