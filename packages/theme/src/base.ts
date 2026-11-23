import type { Theme, TokenSet } from "./contrast"

// Defaults of the brand tokens and the surfaces their pairs sit on, from
// apps/web/app/globals.css (base.spec.ts guards drift).
export const BASE: Record<Theme, TokenSet> = {
  light: {
    background: "#ffffff",
    card: "#ffffff",
    muted: "#f5f5f5",
    sidebar: "#fafafa",
    accent: "#f5f5f5",
    "sidebar-accent": "#f0f0f0",
    primary: "#5e47e8",
    "primary-foreground": "#f7f9ff",
    "sidebar-primary": "var(--primary)",
    "sidebar-primary-foreground": "var(--primary-foreground)",
    secondary: "#f5f5f5",
    "secondary-foreground": "#171717",
    "cat-1": "#5e47e8",
  },
  dark: {
    background: "#0a0a0a",
    card: "#171717",
    muted: "#262626",
    sidebar: "#171717",
    accent: "#262626",
    "sidebar-accent": "#262626",
    primary: "#5e47e8",
    "primary-foreground": "#f7f9ff",
    "sidebar-primary": "var(--primary)",
    "sidebar-primary-foreground": "var(--primary-foreground)",
    secondary: "#262626",
    "secondary-foreground": "#fafafa",
    "cat-1": "#9a92ff",
  },
}
