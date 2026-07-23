import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export function Button({ 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false, 
  className = '', 
  children, 
  ...props 
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center font-bold transition-all rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 shrink-0";
  
  const variants = {
    primary: "bg-emerald-700 text-white hover:bg-emerald-800 focus:ring-emerald-700 shadow-md",
    accent: "bg-emerald-400 text-emerald-950 hover:bg-emerald-300 focus:ring-emerald-400 shadow-lg hover:shadow-emerald-400/20",
    secondary: "bg-white text-slate-900 border border-slate-200 hover:bg-slate-50 focus:ring-slate-200 shadow-sm",
    ghost: "bg-transparent text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 focus:ring-emerald-500"
  };

  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg"
  };

  const classes = `${baseStyles} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`;

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
