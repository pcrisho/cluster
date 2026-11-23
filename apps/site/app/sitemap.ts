import type { MetadataRoute } from "next"

export const dynamic = "force-static"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3003"

  return [
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
}
