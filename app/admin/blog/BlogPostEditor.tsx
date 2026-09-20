'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { BLOG_TOPIC_SUGGESTIONS } from '@/lib/content/blogTopicSuggestions';
import { collectInvalidFieldLabels, describeMissingRequired, focusFirstInvalid } from '@/lib/forms/requiredFields';


const MarkdownPreview = dynamic(async () => {
  const [{ default: ReactMarkdown }, { default: remarkGfm }] = await Promise.all([
    import('react-markdown'),
    import('remark-gfm'),
  ]);

  function MarkdownPreviewComponent({ content }: { content: string }) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>;
  }

  return MarkdownPreviewComponent;
}, {
  loading: () => <span className="admin-preview-placeholder">Loading preview…</span>,
});

type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  authorName: string;
  category: string | null;
  published: boolean;
  scheduledAt: string | null;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function BlogPostEditor({
  mode,
  post,
  aiEnabled = false,
}: {
  mode: 'create' | 'edit';
  post?: BlogPost;
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [title, setTitle] = useState(post?.title ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [coverImage, setCoverImage] = useState(post?.coverImage ?? '');
  const [authorName, setAuthorName] = useState(post?.authorName ?? 'WorkforceAP Team');
  const [category, setCategory] = useState(post?.category ?? '');
  const [published, setPublished] = useState(post?.published ?? false);
  const [scheduledAt, setScheduledAt] = useState<string>(
    post?.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorFormRef = useRef<HTMLFormElement>(null);
  const [review, setReview] = useState<{
    overallScore?: number;
    summary?: string;
    strengths?: string[];
    improvements?: string[];
    seoSuggestions?: string[];
    toneNote?: string;
  } | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [generateExpanded, setGenerateExpanded] = useState(false);
  const [aiTitle, setAiTitle] = useState('');
  const [aiTopic, setAiTopic] = useState('');
  const [aiTone, setAiTone] = useState('Informative');
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateToast, setGenerateToast] = useState<string | null>(null);
  const generatorRef = useRef<HTMLDivElement>(null);

  const handleUseSuggestion = (title: string, topic: string, cat?: string) => {
    setAiTitle(title);
    setAiTopic(topic);
    if (cat && !category) setCategory(cat);
    setGenerateExpanded(true);
    setTimeout(() => generatorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  const handleTitleChange = (v: string) => {
    setTitle(v);
    if (mode === 'create' && !slug) setSlug(slugify(v));
  };

  const handleGenerate = async () => {
    if (!aiTopic.trim()) return;
    setGenerateLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/blog/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: aiTitle.trim() || undefined,
          topic: aiTopic.trim(),
          tone: aiTone,
          category: category.trim() || 'Career Tips',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      if (data.title && !title) setTitle(data.title);
      if (data.excerpt && !excerpt) setExcerpt(data.excerpt);
      if (data.content) {
        setContent((prev) => (prev ? `${prev}\n\n---\n\n${data.content}` : data.content));
      }
      setGenerateToast('Draft generated — review and edit before publishing');
      setTimeout(() => setGenerateToast(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed — check your API key or try again');
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleReview = async () => {
    setReviewLoading(true);
    setReview(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/blog/ai/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, excerpt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setReview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setReviewLoading(false);
    }
  };

  const handleSave = async (publish: boolean) => {
    // Both "Save & Publish" (type=button) and the submit button land here, so
    // the required-field summary lives here rather than in the browser
    // tooltip (audit 2026-09-20).
    const formEl = editorFormRef.current;
    if (formEl) {
      const missing = collectInvalidFieldLabels(formEl);
      if (missing.length > 0) {
        setError(describeMissingRequired(missing, { leadIn: publish ? 'Before you can publish' : 'Before you can save' }));
        focusFirstInvalid(formEl);
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        slug: slug.trim(),
        title: title.trim(),
        excerpt: excerpt.trim() || null,
        content: content.trim(),
        coverImage: coverImage.trim() || null,
        authorName: authorName.trim() || 'WorkforceAP Team',
        category: category.trim() || null,
        published: publish,
        scheduledAt: scheduledAt || null,
      };

      if (mode === 'create') {
        const res = await fetch('/api/admin/blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to create');
        router.push(`/admin/blog/${data.id}/edit`);
        router.refresh();
      } else {
        const res = await fetch(`/api/admin/blog/${post!.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to update');
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    width: '100%',
    maxWidth: '600px',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--outline-variant)',
    borderRadius: '6px',
    fontSize: '1rem',
  } as const;

  const labelStyle = { display: 'block', marginBottom: '0.25rem', fontWeight: 500 } as const;

  return (
    <form
      ref={editorFormRef}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        handleSave(published);
      }}
      style={{ maxWidth: '800px' }}
    >
      {error && <div role="alert" className="admin-error-banner" style={{ padding: '0.75rem', marginBottom: '1rem', borderRadius: '6px' }}>{error}</div>}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="blogposteditor-title-field" style={labelStyle}>Title</label>
        <input id="blogposteditor-title-field"
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          required
          className="admin-form-input"
          style={inputStyle}
          placeholder="Post title"
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="blogposteditor-slug-url-field" style={labelStyle}>Slug (URL)</label>
        <input id="blogposteditor-slug-url-field"
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          className="admin-form-input"
          style={inputStyle}
          placeholder="url-friendly-slug"
        />
        <small className="admin-form-hint" style={{ marginTop: '0.25rem', display: 'block' }}>
          Preview: /blog/{slug || 'your-slug'}
        </small>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="blogposteditor-category-field-2" style={labelStyle}>Category</label>
        <input id="blogposteditor-category-field-2"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="admin-form-input"
          style={inputStyle}
          placeholder="e.g. Career Tips, Success Stories"
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="blogposteditor-excerpt-field" style={labelStyle}>Excerpt</label>
        <textarea id="blogposteditor-excerpt-field"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          rows={2}
          className="admin-form-input"
          style={{ ...inputStyle, resize: 'vertical' }}
          placeholder="Short summary for listing page"
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="blogposteditor-cover-image-url-field" style={labelStyle}>Cover Image URL</label>
        <input id="blogposteditor-cover-image-url-field"
          type="url"
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          className="admin-form-input"
          style={inputStyle}
          placeholder="https://..."
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="blogposteditor-author-field" style={labelStyle}>Author</label>
        <input id="blogposteditor-author-field"
          type="text"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          className="admin-form-input"
          style={inputStyle}
          placeholder="WorkforceAP Team"
        />
      </div>
      {aiEnabled && (
        <div style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem', fontWeight: 600 }}>Suggested topics</h3>
          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              overflowX: 'auto',
              paddingBottom: '0.5rem',
              marginBottom: '1rem',
              scrollbarWidth: 'thin',
            }}
          >
            {BLOG_TOPIC_SUGGESTIONS.map((s, i) => (
              <div
                key={i}
                className="admin-suggestion-card"
                style={{
                  flexShrink: 0,
                  width: '220px',
                  padding: '0.75rem',
                  borderRadius: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.8125rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--color-accent)',
                    fontWeight: 600,
                  }}
                >
                  {s.category}
                </span>
                <h4 style={{ margin: '0.5rem 0', fontSize: '0.9rem', lineHeight: 1.3, color: 'var(--color-on-surface)' }}>{s.title}</h4>
                <button
                  type="button"
                  onClick={() => handleUseSuggestion(s.title, s.topic, s.category)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: 'var(--color-accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Use This →
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setGenerateExpanded(!generateExpanded)}
            className="admin-ghost-button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.95rem',
            }}
          >
            <Sparkles size={16} /> Generate with AI
            {generateExpanded ? <ChevronDown size={14} className="admin-muted-text" /> : <ChevronRight size={14} className="admin-muted-text" />}
          </button>
          {generateExpanded && (
            <div
              ref={generatorRef}
              className="admin-ai-panel"
              style={{
                marginTop: '0.75rem',
                padding: '1rem',
                borderRadius: '6px',
              }}
            >
              <div style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="blogposteditor-title-optional-field" style={labelStyle}>Title (optional)</label>
                <input id="blogposteditor-title-optional-field"
                  type="text"
                  value={aiTitle}
                  onChange={(e) => setAiTitle(e.target.value)}
                  className="admin-form-input"
                  style={inputStyle}
                  placeholder="e.g. Why Veterans Are Built for Tech Careers"
                />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label htmlFor="blogposteditor-topic-angle-field" style={labelStyle}>Topic / angle *</label>
                <input id="blogposteditor-topic-angle-field"
                  type="text"
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  className="admin-form-input"
                  style={inputStyle}
                  placeholder="e.g. Military discipline translates to IT certifications, highlight CompTIA Security+"
                />
              </div>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <div>
                  <label htmlFor="blogposteditor-tone-field" style={labelStyle}>Tone</label>
                  <select id="blogposteditor-tone-field"
                    value={aiTone}
                    onChange={(e) => setAiTone(e.target.value)}
                    className="admin-form-input"
                    style={inputStyle}
                  >
                    <option>Informative</option>
                    <option>Inspiring</option>
                    <option>Practical</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="blogposteditor-category-field" style={labelStyle}>Category</label>
                  <input id="blogposteditor-category-field"
                    type="text"
                    value={category || 'Career Tips'}
                    readOnly
                    className="admin-form-input admin-topic-pill"
                    style={{ ...inputStyle, maxWidth: '200px' }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generateLoading || !aiTopic.trim()}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'var(--color-accent)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: 600,
                  cursor: generateLoading || !aiTopic.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {generateLoading ? 'Generating…' : 'Generate Draft →'}
              </button>
              {generateToast && (
                <span style={{ marginLeft: '1rem', fontSize: '0.9rem', color: 'var(--color-accent)' }}>
                  {generateToast}
                </span>
              )}
            </div>
          )}
        </div>
      )}
      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="blogposteditor-content-markdown-field" style={labelStyle}>Content (Markdown)</label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            alignItems: 'stretch',
          }}
          className="live-editor-split"
        >
          <textarea id="blogposteditor-content-markdown-field"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            rows={18}
            className="admin-form-input"
            style={{
              ...inputStyle,
              maxWidth: '100%',
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              minHeight: '400px',
            }}
            placeholder="Write your post in Markdown. Use **bold**, ## headings, etc."
          />
          <div
            className="markdown-body admin-form-panel"
            style={{
              borderRadius: '6px',
              padding: '1rem',
              minHeight: '400px',
              overflow: 'auto',
            }}
          >
            <div style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>
              {content ? (
                <MarkdownPreview content={content} />
              ) : (
                <span className="admin-preview-placeholder">Live preview appears here…</span>
              )}
            </div>
          </div>
        </div>
        <style>{`
          @media (max-width: 900px) {
            .live-editor-split { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label htmlFor="blogposteditor-schedule-for-later-optional-field" style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--color-on-surface)' }}>Schedule for later (optional)</label>
          <input id="blogposteditor-schedule-for-later-optional-field"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => {
              setScheduledAt(e.target.value);
              if (e.target.value) setPublished(false);
            }}
            className="admin-form-input"
            style={{ padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.9rem', maxWidth: '240px' }}
          />
          {scheduledAt && (
            <small style={{ color: '#2563eb', fontSize: '0.8125rem' }}>
              Will auto-publish on {new Date(scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </small>
          )}
        </div>
        <button
          type="button"
          onClick={handleReview}
          disabled={reviewLoading || !content.trim()}
          className="admin-secondary-button"
          style={{
            padding: '0.4rem 0.9rem',
            borderRadius: '6px',
            fontWeight: 500,
            cursor: reviewLoading || !content.trim() ? 'not-allowed' : 'pointer',
            fontSize: '0.9rem',
          }}
        >
          {reviewLoading ? 'Reviewing…' : 'Review with AI'}
        </button>
      </div>
      {review && (
        <div className="admin-form-panel" style={{ marginBottom: '1.5rem', padding: '1rem', borderRadius: '8px' }}>
          <h4 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
            AI review {review.overallScore != null && `— ${review.overallScore}/10`}
          </h4>
          {review.summary && <p style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>{review.summary}</p>}
          {review.strengths && review.strengths.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>Strengths:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', fontSize: '0.9rem' }}>
                {review.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {review.improvements && review.improvements.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>Improvements:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', fontSize: '0.9rem' }}>
                {review.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {review.seoSuggestions && review.seoSuggestions.length > 0 && (
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.85rem' }}>SEO:</strong>
              <ul style={{ margin: '0.25rem 0 0 1.25rem', fontSize: '0.9rem' }}>
                {review.seoSuggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {review.toneNote && (
            <p className="admin-muted-text" style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
              <strong>Tone:</strong> {review.toneNote}
            </p>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => handleSave(true)}
          disabled={saving}
          style={{
            padding: '0.5rem 1.25rem',
            background: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save & Publish'}
        </button>
        <button
          type="submit"
          disabled={saving}
          className="admin-secondary-button"
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: '6px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
        {mode === 'edit' && post && (
          <Link
            href={`/admin/blog/preview/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '0.5rem 1.25rem',
              color: 'var(--color-accent)',
              textDecoration: 'none',
              alignSelf: 'center',
            }}
          >
            Preview →
          </Link>
        )}
      </div>
    </form>
  );
}
