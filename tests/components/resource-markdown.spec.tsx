import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ResourceMarkdown from '@/components/portal/ResourceMarkdown';

type Resource = { id: string; title: string; file?: string };
const contentRoot = join(process.cwd(), 'content', 'member-resources');
const resources = JSON.parse(readFileSync(join(contentRoot, 'index.json'), 'utf8')) as Resource[];

afterEach(cleanup);

describe('career-library resource headings', () => {
  it.each(resources.filter((resource) => resource.file))('$id keeps one page title and nested content headings', (resource) => {
    const content = readFileSync(join(contentRoot, resource.file!), 'utf8');
    const { container } = render(
      <>
        <h1>{resource.title}</h1>
        <article>
          <ResourceMarkdown content={content} />
        </article>
      </>,
    );

    const pageHeadings = [...container.querySelectorAll('h1')];
    const contentHeadings = [...container.querySelectorAll('article h1, article h2, article h3, article h4, article h5, article h6')];
    const markdownLevels = [...content.matchAll(/^(#{1,5})\s+.+$/gm)].map((match) => match[1].length);

    expect(pageHeadings).toHaveLength(1);
    expect(pageHeadings[0]).toHaveTextContent(resource.title);
    expect(contentHeadings.map((heading) => Number(heading.tagName.slice(1)))).toEqual(
      markdownLevels.map((level) => level + 1),
    );
    expect(contentHeadings[0]?.tagName).toBe('H2');
  });
});
