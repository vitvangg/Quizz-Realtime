import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border-4 border-black px-3 py-1.5 text-xs font-black uppercase tracking-wide transition-all",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-brutal-sm",
        secondary: "bg-secondary text-secondary-foreground shadow-brutal-sm",
        destructive: "bg-destructive text-white shadow-brutal-sm",
        outline: "bg-white text-black border-black",
        success: "bg-neon-green text-black shadow-brutal-sm",
        warning: "bg-neon-orange text-black shadow-brutal-sm",
        info: "bg-neon-blue text-black shadow-brutal-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
