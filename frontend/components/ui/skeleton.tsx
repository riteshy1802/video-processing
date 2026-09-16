import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-800/60", className)}
      {...props}
    />
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800/60 bg-white dark:bg-[#111726] p-4 space-y-3 shadow-xs">
      {/* Thumbnail placeholder skeleton */}
      <Skeleton className="w-full aspect-video rounded-xl bg-slate-200/80 dark:bg-slate-800/60" />
      
      {/* Header title skeleton */}
      <div className="flex justify-between items-start pt-1">
        <Skeleton className="h-5 w-2/3 bg-slate-200/80 dark:bg-slate-800/60" />
        <Skeleton className="h-5 w-16 rounded-md bg-slate-200/80 dark:bg-slate-800/60" />
      </div>

      {/* Details skeleton */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <Skeleton className="h-4 w-full bg-slate-200/80 dark:bg-slate-800/60" />
        <Skeleton className="h-4 w-full bg-slate-200/80 dark:bg-slate-800/60" />
      </div>
    </div>
  );
}
