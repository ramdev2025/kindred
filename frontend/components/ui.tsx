"use client";

/**
 * Shared UI component library — consistent, accessible primitives
 * that replace ad-hoc styling across the app (Phase 4.2).
 */

import { forwardRef, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// ── Button ────────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gradient";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-white text-black font-semibold hover:bg-zinc-100 active:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-white/50",
  secondary:
    "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 focus-visible:ring-2 focus-visible:ring-white/20",
  ghost:
    "text-white/60 hover:text-white hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/10",
  danger:
    "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 focus-visible:ring-2 focus-visible:ring-red-500/30",
  gradient:
    "kindred-gradient text-white font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400/50",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2.5 rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading, icon, children, className = "", disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center font-medium transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
          ${variantClasses[variant]} ${sizeClasses[size]} ${className}
        `}
        {...props}
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : icon ? (
          <span className="shrink-0">{icon}</span>
        ) : null}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

// ── Input ─────────────────────────────────────────────────────────────────────

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ label, error, hint, className = "", id, ...props }, ref) => {
    const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, "-")}`;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-[var(--muted-foreground)] block">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`
            w-full px-4 py-2.5 bg-[var(--muted)] border rounded-lg text-sm text-white
            placeholder-zinc-500 transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500
            ${error ? "border-red-500/50" : "border-[var(--border)]"}
            ${className}
          `}
          {...props}
        />
        {error && <p className="text-[11px] text-red-400 font-medium">{error}</p>}
        {hint && !error && <p className="text-[11px] text-white/30">{hint}</p>}
      </div>
    );
  }
);
TextInput.displayName = "TextInput";

// ── Select ────────────────────────────────────────────────────────────────────

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, className = "", id, ...props }, ref) => {
    const selectId = id || `select-${label?.toLowerCase().replace(/\s+/g, "-")}`;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={selectId} className="text-xs font-medium text-[var(--muted-foreground)] block">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={`
            w-full px-4 py-2.5 bg-[var(--muted)] border border-[var(--border)] rounded-lg
            text-sm text-white transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500
            ${className}
          `}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
);
Select.displayName = "Select";

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

const modalSizes: Record<string, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({ open, onClose, title, subtitle, icon, children, size = "md" }: ModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              className={`glass-card w-full ${modalSizes[size]} p-6 max-h-[80vh] overflow-y-auto`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  {icon && (
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                      {icon}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    {subtitle && (
                      <p className="text-xs text-[var(--muted-foreground)]">{subtitle}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}

const badgeVariants: Record<string, string> = {
  default: "bg-white/5 border-white/10 text-white/60",
  success: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  warning: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  danger: "bg-red-500/10 border-red-500/20 text-red-400",
  info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
};

export function Badge({ children, variant = "default", size = "sm" }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 border rounded-full font-medium uppercase tracking-wider
        ${badgeVariants[variant]}
        ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"}
      `}
    >
      {children}
    </span>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipProps {
  children: ReactNode;
  text: string;
  shortcut?: string;
}

export function Tooltip({ children, text, shortcut }: TooltipProps) {
  return (
    <div className="relative group/tooltip">
      {children}
      <div
        className="
          absolute bottom-full left-1/2 -translate-x-1/2 mb-2
          px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10
          text-xs text-white whitespace-nowrap shadow-xl
          opacity-0 scale-95 pointer-events-none
          group-hover/tooltip:opacity-100 group-hover/tooltip:scale-100
          transition-all duration-200 z-50
        "
      >
        <span>{text}</span>
        {shortcut && (
          <span className="ml-2 text-white/30 font-mono text-[10px]">{shortcut}</span>
        )}
      </div>
    </div>
  );
}
