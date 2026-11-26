import { Skeleton } from "@/components/ui/skeleton"

function PageHeaderSkeleton({
  titleWidth = "w-48",
  descWidth = "w-96",
  hasActions = false,
}: {
  titleWidth?: string
  descWidth?: string
  hasActions?: boolean
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <Skeleton className={`h-8 ${titleWidth}`} />
          <Skeleton className={`mt-2 h-4 ${descWidth}`} />
        </div>
      </div>
      {hasActions && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Skeleton className="h-8 w-64 rounded-md" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      )}
    </div>
  )
}

function ToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-[72px] rounded-md" />
        <Skeleton className="h-8 w-[72px] rounded-md" />
      </div>
      <Skeleton className="h-8 w-[140px] rounded-md" />
    </div>
  )
}

export function PositionPanelSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <ToolbarSkeleton />
      <div className="rounded-md border">
        <div className="flex items-center gap-4 border-b px-4 py-2.5">
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-4 w-[80px]" />
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-[60px]" />
          <Skeleton className="h-4 w-5" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="size-3 shrink-0 rounded-sm" />
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-[140px]" />
                {i % 2 === 0 && <Skeleton className="h-3 w-[100px]" />}
              </div>
            </div>
            <Skeleton className="h-5 w-[80px] rounded-full" />
            <Skeleton className="h-4 w-[60px]" />
            <Skeleton className="h-5 w-8 rounded-full" />
            <Skeleton className="h-5 w-[64px] rounded-full" />
            <Skeleton className="size-7 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function UserAssignmentTreeSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-t-md border-b bg-muted/30 p-2">
        <div className="mb-2 flex items-center gap-2 px-2">
          <Skeleton className="size-4" />
          <Skeleton className="h-4 w-[80px]" />
          <Skeleton className="h-5 w-6 rounded-full" />
        </div>
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-2 rounded-md border bg-background p-1.5"
            >
              <Skeleton className="size-7 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-[140px]" />
              <Skeleton className="ml-auto h-6 w-[64px] rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md py-1.5 pr-2"
            style={{ paddingLeft: `${i * 16 + 8}px` }}
          >
            <Skeleton className="size-6" />
            <Skeleton className="size-3.5 shrink-0 rounded" />
            <Skeleton className="h-4 w-[120px]" />
            <Skeleton className="h-5 w-[50px] rounded-full" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function PositionsPageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <PageHeaderSkeleton titleWidth="w-36" descWidth="w-96" />
      <PositionPanelSkeleton />
    </div>
  )
}

export function OrgAssignPageSkeleton() {
  return (
    <div className="mx-auto w-full space-y-6 p-6">
      <PageHeaderSkeleton titleWidth="w-56" descWidth="w-[540px]" />
      <ToolbarSkeleton />
      <UserAssignmentTreeSkeleton />
    </div>
  )
}

export function MembersSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <ToolbarSkeleton />
      <MemberRowsSkeleton />
    </div>
  )
}

/** The rows alone, for when the toolbar stays and only the page reloads. */
export function MemberRowsSkeleton() {
  return (
    <div className="rounded-xl border">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
        >
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-[140px]" />
            <Skeleton className="h-3 w-[180px]" />
          </div>
          <Skeleton className="hidden h-8 w-36 rounded-lg sm:block" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

export function OrganizationSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-xl border p-6">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-full max-w-md rounded-lg" />
        </div>
      ))}
    </div>
  )
}
