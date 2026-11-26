import {
  Building2Icon,
  BriefcaseIcon,
  CodeIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"

const ICON_REGISTRY: Record<string, LucideIcon> = {
  Building2: Building2Icon,
  Briefcase: BriefcaseIcon,
  Users: UsersIcon,
  Code: CodeIcon,
}

interface OrgNodeIconProps {
  name: string | null | undefined
  className?: string
  style?: React.CSSProperties
}

export function OrgNodeIcon({ name, className, style }: OrgNodeIconProps) {
  const Icon = ICON_REGISTRY[name ?? ""] ?? Building2Icon
  return <Icon className={className} style={style} />
}
