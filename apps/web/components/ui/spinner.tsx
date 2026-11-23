import { cn } from "@/lib/utils"
import { LoaderCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useTranslations("ui")
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role="status"
      aria-label={t("loading")}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
