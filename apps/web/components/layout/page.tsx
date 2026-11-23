import * as React from "react"

import { cn } from "@/lib/utils"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"

type Width = "narrow" | "default" | "wide" | "full"

const WIDTH_CLASS: Record<Width, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
}

interface PageContainerProps {
  width?: Width
  className?: string
  children: React.ReactNode
}

export function PageContainer({
  width = "default",
  className,
  children,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 p-6",
        WIDTH_CLASS[width],
        className
      )}
    >
      {children}
    </div>
  )
}

interface PageHeaderProps {
  title: string
  description?: string
  icon?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <div className="shrink-0 rounded-full bg-muted p-2">{icon}</div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          {actions}
        </div>
      )}
    </div>
  )
}

interface PageEmptyProps {
  icon: React.ReactNode
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}

/** A page with nothing to show yet: what is missing and, when there is one, the action that fixes it. */
export function PageEmpty({
  icon,
  title,
  description,
  actions,
  className,
}: PageEmptyProps) {
  return (
    <Empty className={cn("border", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {actions && <EmptyContent>{actions}</EmptyContent>}
    </Empty>
  )
}

interface PageLoadingProps {
  label?: string
  className?: string
}

export function PageLoading({
  label = "Loading…",
  className,
}: PageLoadingProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground",
        className
      )}
    >
      <Spinner />
      {label}
    </div>
  )
}
