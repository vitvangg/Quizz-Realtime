import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center font-bold uppercase tracking-wide transition-all duration-150 outline-none select-none focus-visible:ring-4 focus-visible:ring-primary/30 active:translate-y-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1",
        outline: "border-4 border-black bg-white text-black shadow-brutal-sm hover:shadow-none hover:translate-x-1 hover:translate-y-1",
        secondary: "bg-secondary text-secondary-foreground border-4 border-black shadow-brutal-sm hover:shadow-none hover:translate-x-1 hover:translate-y-1",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-white border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1",
        link: "text-primary underline-offset-4 hover:underline",
        // Neo-Brutalism specific variants
        neon: "bg-neon-yellow text-black border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1",
        success: "bg-neon-green text-black border-4 border-black shadow-brutal hover:shadow-none hover:translate-x-1 hover:translate-y-1",
      },
      size: {
        default: "h-11 gap-2 px-6 text-sm rounded-lg",
        xs: "h-8 gap-1 px-3 text-xs rounded-md",
        sm: "h-9 gap-1.5 px-4 text-sm rounded-lg",
        lg: "h-12 gap-2 px-8 text-base rounded-xl",
        xl: "h-14 gap-3 px-10 text-lg rounded-xl",
        icon: "size-10 rounded-lg",
        "icon-sm": "size-8 rounded-md",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
