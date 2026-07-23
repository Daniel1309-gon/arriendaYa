import { useEffect, useRef, type KeyboardEvent, type ClipboardEvent } from "react";

const LENGTH = 6;

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}

export function OtpInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  id = "otp",
}: OtpInputProps) {
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] ?? "");
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setDigit = (index: number, char: string) => {
    const next = digits.map((d, i) => (i === index ? char : d));
    onChange(next.join("").slice(0, LENGTH));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1);
    if (!digit && raw !== "") return;
    setDigit(index, digit);
    if (digit && index < LENGTH - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (
    index: number,
    e: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setDigit(index - 1, "");
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < LENGTH - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, LENGTH);
    if (!pasted) return;
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, LENGTH - 1);
    refs.current[focusIdx]?.focus();
  };

  return (
    <div
      className="flex justify-between gap-2"
      role="group"
      aria-label="Código de verificación de 6 dígitos"
      onPaste={handlePaste}
    >
      {digits.map((digit, idx) => (
        <input
          key={idx}
          id={idx === 0 ? id : undefined}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Dígito ${idx + 1} de ${LENGTH}`}
          onChange={(e) => handleChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all bg-white text-slate-900 disabled:opacity-50"
        />
      ))}
    </div>
  );
}
