import { useState, useRef, useEffect } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function Select({ options, value, onChange, placeholder = 'Selecciona...', className = '' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className={`relative w-full ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button 
        type="button"
        className="w-full flex items-center justify-between bg-transparent border-none p-0 text-slate-900 text-sm font-medium outline-none focus:ring-0 cursor-pointer text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? 'text-slate-900' : 'text-slate-400'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg 
          className={`w-4 h-4 text-emerald-700 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path>
        </svg>
      </button>

      {/* Dropdown Menu (Glassmorphism) */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 w-full md:w-56 mt-4 bg-white/90 backdrop-blur-xl border border-slate-100 shadow-[0_20px_50px_rgba(0,0,0,0.1)] rounded-xl overflow-hidden z-50 animate-fade-in-up origin-top" 
          style={{ animationDuration: '200ms' }}
        >
          <ul className="py-2 m-0 flex flex-col">
            {options.map((option) => {
              const isSelected = value === option.value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    className={`w-full text-left px-5 py-3 text-sm font-medium transition-colors hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-between
                      ${isSelected ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600'}`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {isSelected && (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
