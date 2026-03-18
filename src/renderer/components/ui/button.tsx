import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'size-\'])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary/15 text-blue-300 border border-primary/25 hover:bg-primary/25 hover:text-blue-200',
        destructive:
          'bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 hover:text-red-300 focus-visible:ring-red-500/20',
        outline:
          'border border-white/10 bg-[#1e1e1e] text-slate-300 shadow-xs hover:bg-[#282828] hover:text-white',
        secondary: 'bg-[#222222] text-slate-300 border border-white/8 hover:bg-[#2a2a2a] hover:text-white',
        ghost:
          'bg-[#1a1a1a] text-slate-300 hover:bg-[#242424] hover:text-white',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        xs: 'h-6 gap-1 rounded-md px-2 text-xs [&_svg:not([class*=\'size-\'])]:size-3',
        sm: 'h-8 gap-1.5 rounded-md px-3',
        lg: 'h-10 rounded-md px-6',
        icon: 'size-9',
        'icon-xs': 'size-6 rounded-md [&_svg:not([class*=\'size-\'])]:size-3',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

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
