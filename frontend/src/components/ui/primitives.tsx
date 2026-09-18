import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/utils";

/* ---------------------------------------------------------------- Button */

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25",
        outline: "border border-line bg-transparent text-muted hover:border-line-bright hover:text-ink",
        ghost: "text-muted hover:bg-raised hover:text-ink",
        danger: "border border-critical/40 bg-critical/10 text-critical hover:bg-critical/20",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";

/* ----------------------------------------------------------------- Panel */

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("panel", className)} {...props} />;
}

export function PanelHeader({
  title,
  meta,
  action,
  icon,
}: {
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="panel-header">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-dim">{icon}</span>}
        <h2 className="panel-title truncate">{title}</h2>
        {meta && <span className="metadata truncate">{meta}</span>}
      </div>
      {action}
    </header>
  );
}

/* ----------------------------------------------------------------- Badge */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-2xs uppercase tracking-wider",
  {
    variants: {
      tone: {
        neutral: "border-line-bright/70 bg-raised text-muted",
        accent: "border-accent/40 bg-accent/10 text-accent",
        verified: "border-verified/40 bg-verified/10 text-verified",
        review: "border-review/40 bg-review/10 text-review",
        critical: "border-critical/40 bg-critical/10 text-critical",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/* ----------------------------------------------------------------- Input */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-sm border border-line bg-base px-2.5 text-sm text-ink placeholder:text-dim",
        "transition-colors focus:border-accent/60 focus:outline-none",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse-soft rounded-sm bg-raised", className)} />;
}

/* ------------------------------------------------------------ EmptyState */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-dim">{icon}</div>}
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-relaxed text-dim">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
