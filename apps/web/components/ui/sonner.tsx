"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
} from "lucide-react"

import { Spinner } from "@/components/ui/spinner"

/**
 * Status toasts take the design-system tones. Sonner paints every toast from `--normal-bg`,
 * `--normal-text` and `--normal-border`, so each tone redefines them on the toast itself; the
 * subtle fill is translucent, so it is laid over the popover colour to stay opaque.
 */
const TONES = {
  success:
    "[--normal-bg:linear-gradient(var(--success-subtle),var(--success-subtle)),var(--popover)] [--normal-border:var(--success-border)] [--normal-text:var(--success-text)]",
  error:
    "[--normal-bg:linear-gradient(var(--danger-subtle),var(--danger-subtle)),var(--popover)] [--normal-border:var(--danger-border)] [--normal-text:var(--danger-text)]",
  warning:
    "[--normal-bg:linear-gradient(var(--warning-subtle),var(--warning-subtle)),var(--popover)] [--normal-border:var(--warning-border)] [--normal-text:var(--warning-text)]",
  info: "[--normal-bg:linear-gradient(var(--info-subtle),var(--info-subtle)),var(--popover)] [--normal-border:var(--info-border)] [--normal-text:var(--info-text)]",
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Spinner />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // Sonner gives the description a fixed grey per theme.
          description: "!text-current",
          // Sonner paints the button from --normal-bg, which a tone makes a gradient: keep it legible.
          actionButton:
            "!border !border-current !bg-transparent !font-medium !text-current",
          ...TONES,
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
