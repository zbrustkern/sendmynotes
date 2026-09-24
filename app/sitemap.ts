import { MetadataRoute } from "next";
import { getAllScenarios } from "@/lib/seo-scenarios";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://sendmynotes.com";
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/send`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const scenarioRoutes: MetadataRoute.Sitemap = getAllScenarios().map((s) => ({
    url: `${baseUrl}/send/${s.occasionSlug}/${s.slug}`,
    lastModified,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...scenarioRoutes];
}
