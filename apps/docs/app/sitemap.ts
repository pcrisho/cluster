import type { MetadataRoute } from "next"
import { listPages } from "@/lib/content"
import { getDocsUrl } from "@/lib/docs-url"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getDocsUrl() ?? "http://localhost:3004"
  const pages = listPages("en")

  const entries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/en/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          en: `${baseUrl}/en/`,
          es: `${baseUrl}/es/`,
          "x-default": `${baseUrl}/en/`,
        },
      },
    },
    {
      url: `${baseUrl}/es/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          en: `${baseUrl}/en/`,
          es: `${baseUrl}/es/`,
          "x-default": `${baseUrl}/en/`,
        },
      },
    },
  ]

  for (const page of pages) {
    for (const locale of ["en", "es"] as const) {
      entries.push({
        url: `${baseUrl}/${locale}/${page.path}/`,
        lastModified: new Date(),
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: {
          languages: {
            en: `${baseUrl}/en/${page.path}/`,
            es: `${baseUrl}/es/${page.path}/`,
            "x-default": `${baseUrl}/en/${page.path}/`,
          },
        },
      })
    }
  }

  return entries
}
