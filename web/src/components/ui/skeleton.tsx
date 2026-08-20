import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse bg-[color-mix(in_oklch,var(--ink),transparent_95%)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
