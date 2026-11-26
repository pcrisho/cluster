import {
  DM_Sans,
  Geist,
  IBM_Plex_Sans,
  Inter,
  Nunito_Sans,
  Source_Sans_3,
} from "next/font/google"

// One declaration per catalogue font (FONT_KEYS in @cluster/theme); the browser downloads only
// the one a theme selects through `--font-sans`. Inter is the default, so it alone is preloaded.
// next/font needs literal options and one const per call at module scope: no shared object, no array.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-geist",
})
const sourceSans3 = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-source-sans-3",
})
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
  variable: "--font-ibm-plex-sans",
})
const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-dm-sans",
})
const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-nunito-sans",
})

export const FONT_CLASSNAMES = [
  inter,
  geist,
  sourceSans3,
  ibmPlexSans,
  dmSans,
  nunitoSans,
]
  .map((f) => f.variable)
  .join(" ")
