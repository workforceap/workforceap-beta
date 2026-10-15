/** Known seeded outcome claims stay private until staff verify the story and consent. */
export const WITHHELD_BLOG_SLUGS = ['from-warehouse-to-it-support-marcus-story'] as const;

export function isBlogPublicationAllowed(slug: string): boolean {
  return !(WITHHELD_BLOG_SLUGS as readonly string[]).includes(slug);
}

/** One public predicate for articles, related links, counts and the sitemap. */
export function publicBlogPublicationWhere() {
  return { published: true, slug: { notIn: [...WITHHELD_BLOG_SLUGS] } };
}
