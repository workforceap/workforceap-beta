'use client';

import { useRouter } from 'next/navigation';
import NextLink from 'next/link';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import {
  DesignSurface,
  SectionHeader,
  DataTable,
  StatusTag,
  type Column,
  type KitTone,
} from '@/components/portal/kit';

/**
 * Blog — admin marketing & resource posts rendered as a dense table.
 * Mockup: workforceap-admin-full.html "blog" view.
 * Target route: /admin/blog
 *
 * Columns: Title · Author · Category · Status · Updated.
 * Status is a StatusTag (Published=ok, Draft=warn). Wide table collapses to
 * stacked cards on mobile via DataTable mobile="cards".
 */

export type BlogDisplayStatus = 'Published' | 'Scheduled' | 'Draft';

export interface BlogRow {
  id: string;
  title: string;
  author: string;
  category: string;
  status: BlogDisplayStatus;
  /** Pre-formatted updated date, e.g. "Jun 10". */
  updated: string;
}

export interface BlogKitProps {
  posts?: BlogRow[];
}

const DEFAULT_POSTS: BlogRow[] = [
  {
    id: 'aws-certs',
    title: '5 AWS Certs That Get You Hired',
    author: 'Team',
    category: 'Career',
    status: 'Published',
    updated: 'Jun 10',
  },
  {
    id: 'wioa-funding',
    title: 'How WIOA Funding Works',
    author: 'A. Reyes',
    category: 'Guides',
    status: 'Draft',
    updated: 'Jun 18',
  },
];

const STATUS_TONE: Record<BlogDisplayStatus, KitTone> = {
  Published: 'ok',
  Scheduled: 'info',
  Draft: 'warn',
};

export function BlogKit({ posts = DEFAULT_POSTS }: BlogKitProps) {
  const router = useRouter();
  const columns: Column<BlogRow>[] = [
    {
      key: 'title',
      header: 'Title',
      render: (row) => <span style={{ fontWeight: 700 }}>{row.title}</span>,
    },
    {
      key: 'author',
      header: 'Author',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.author}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (row) => <span style={{ color: 'var(--wa-muted)' }}>{row.category}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusTag tone={STATUS_TONE[row.status]}>{row.status}</StatusTag>,
    },
    {
      key: 'updated',
      header: 'Updated',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--wa-muted)', whiteSpace: 'nowrap' }}>{row.updated}</span>
      ),
    },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <SectionHeader
        title="Blog"
        kicker="Content"
        goal="Marketing & resource posts"
        action={
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <AstryxLink href="/admin/blog/ai" as={NextLink as never} isStandalone>
              <Button
                label="AI Assistant"
                variant="secondary"
                size="sm"
                icon={<Sparkles size={14} aria-hidden="true" />}
              />
            </AstryxLink>
            <AstryxLink href="/admin/blog/new" as={NextLink as never} isStandalone>
              <Button
                label="New Post"
                variant="primary"
                size="sm"
                icon={<Plus size={14} aria-hidden="true" />}
              />
            </AstryxLink>
          </div>
        }
      />

      <DataTable<BlogRow>
        columns={columns}
        rows={posts}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/admin/blog/${row.id}/edit`)}
        minWidth={720}
        mobile="cards"
        cardRender={(row) => (
          <div className="wa-kit-card wa-kit-card--sm">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'var(--wa-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.author} · {row.category}
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <StatusTag tone={STATUS_TONE[row.status]}>{row.status}</StatusTag>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'flex-end',
                gap: 8,
                fontSize: 13,
                color: 'var(--wa-muted)',
                marginTop: 12,
              }}
            >
              <span style={{ whiteSpace: 'nowrap' }}>Updated {row.updated}</span>
            </div>
          </div>
        )}
        emptyTitle="No blog posts yet"
        emptyDescription="Create your first post to start publishing content."
      />
    </DesignSurface>
  );
}
