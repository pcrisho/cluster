import {
  Building2Icon,
  BriefcaseIcon,
  HistoryIcon,
  NetworkIcon,
  PaletteIcon,
  ServerCogIcon,
  UserCogIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import type { AuthUser } from "./api"
import type { Messages } from "./i18n/messages"

type SettingsNavKey = keyof Messages["settings"]["nav"]

export interface SettingsItem {
  /** Key in `settings.nav`. */
  label: SettingsNavKey
  href: string
  icon: LucideIcon
}

export interface SettingsSection {
  /** Key in `settings.nav`. */
  title: SettingsNavKey
  items: SettingsItem[]
}

const personal: SettingsItem[] = [
  { label: "account", href: "/settings/account", icon: UserRoundIcon },
]

const organization: SettingsItem[] = [
  {
    label: "organization",
    href: "/settings/organization",
    icon: Building2Icon,
  },
  { label: "members", href: "/settings/members", icon: UsersIcon },
  { label: "areas", href: "/settings/areas", icon: NetworkIcon },
  { label: "positions", href: "/settings/positions", icon: BriefcaseIcon },
  { label: "assignments", href: "/settings/assignments", icon: UserCogIcon },
  { label: "appearance", href: "/settings/appearance", icon: PaletteIcon },
  { label: "activity", href: "/settings/activity", icon: HistoryIcon },
]

const instance: SettingsItem[] = [
  { label: "instance", href: "/settings/instance", icon: ServerCogIcon },
]

/** Settings sections the user may open; sections without items are dropped. */
export function settingsSections(user: AuthUser | null): SettingsSection[] {
  if (!user) return []
  const sections: SettingsSection[] = [
    { title: "personal", items: personal },
    {
      title: "organizationSection",
      items: user.role === "ADMIN" ? organization : [],
    },
    { title: "instanceSection", items: user.isSuperAdmin ? instance : [] },
  ]
  return sections.filter((section) => section.items.length > 0)
}
