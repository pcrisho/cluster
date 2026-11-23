import type { MetadataRoute } from "next"
import { getDocsUrl } from "@/lib/docs-url"

export const dynamic = "force-static"

export default function robots(): MetadataRoute.Robots {
  const docsUrl = getDocsUrl()
  if (!docsUrl) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    }
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${docsUrl}/sitemap.xml`,
  }
}
