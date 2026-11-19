import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * The one button for the app. Terminal style: square corners, mono,
 * uppercase tracked labels. Pick a variant for intent and a size for
 * context instead of styling buttons by hand.
 *
 * Sizes: sm 32px (header, toolbars), default 40px (dialogs, settings),
 * lg 48px (primary sheet actions). Icon sizes stay 40px on touch screens
 * and shrink on desktop.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-none",
    "font-mono text-[11px] font-medium uppercase tracking-[0.18em]",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-3.5 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Main action: one per view or form. */
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        /** Secondary action next to a primary one (Cancel, Import). */
        outline:
          "border border-border bg-transparent text-foreground hover:border-foreground/30 hover:bg-muted",
        /** Tinted primary: confirm/add chips inside rows and notices. */
        soft: "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
        /** Quiet action on a busy surface. */
        secondary: "border border-border bg-muted text-foreground hover:bg-muted/70",
        /** Icon or low-emphasis action without a frame. */
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        /** Ghost that warns on hover (delete in a row). */
        "ghost-destructive":
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
        /** Destructive action that still needs a confirm step. */
        "outline-destructive":
          "border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10",
        /** Irreversible action, confirmed. */
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        /** Inline text action. */
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[10px]",
        default: "h-10 px-4",
        lg: "h-12 px-6",
        icon: "h-10 w-10 md:h-8 md:w-8",
        "icon-sm": "h-10 w-10 md:h-7 md:w-7",
        /** Fixed 32px square for desktop-only toolbars (header). */
        "icon-compact": "h-8 w-8",
        inline: "h-auto px-0 py-1 text-[10px]",
      },
    },
    compoundVariants: [
      // Icon actions in rows and toolbars stay quiet until hovered.
      {
        variant: "outline",
        size: ["icon", "icon-sm", "icon-compact"],
        class: "text-muted-foreground hover:text-foreground",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        // Default to "button" so a Button inside a form never submits by accident.
        type={asChild ? type : (type ?? "button")}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
