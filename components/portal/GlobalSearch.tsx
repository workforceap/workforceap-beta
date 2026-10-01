'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { CommandPalette, CommandPaletteInput } from '@astryxdesign/core/CommandPalette';
import { Badge } from '@astryxdesign/core/Badge';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { createGlobalSearchSource, type GlobalSearchItem } from '@/lib/admin/globalSearchSource';

/** Admin search uses stable record identities; destinations remain separate. */
export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K to open (Escape is handled by the palette's own dialog)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const searchSource = useMemo(() => createGlobalSearchSource(setSearchError), []);
  useEffect(() => () => searchSource.cancel?.(), [searchSource]);
  useEffect(() => {
    if (!open) searchSource.cancel?.();
  }, [open, searchSource]);

  return (
    <>
      <button
        type="button"
        className="portal-icon-btn wa-min-h-11 wa-min-w-11"
        onClick={() => setOpen(true)}
        aria-label="Search members, staff, employers, partners, and jobs"
        title="Search (⌘K)"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--wa-pad-sm)', paddingInline: 'var(--wa-pad-sm)', borderRadius: 'var(--wa-radius-sm)', border: '1px solid var(--wa-border)', background: 'var(--wa-surface)', color: 'var(--wa-text)', fontSize: 'var(--wa-type-meta)', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        <Search size={16} aria-hidden />
        <span>Search</span>
        {/* Inherits the button's text colour: --wa-text on the surface button, the
            admin rail's --wa-sidebar-label on its dark chrome (4.85:1). --wa-muted
            measured 3.14:1 on the admin rail. */}
        <kbd className="wa-hidden md:wa-inline" style={{ color: 'inherit', fontSize: 'var(--wa-type-meta)' }}>⌘K</kbd>
      </button>
      <CommandPalette<GlobalSearchItem>
        isOpen={open}
        onOpenChange={setOpen}
        searchSource={searchSource}
        label="Global search"
        width="min(40rem, calc(100vw - 2rem))"
        maxHeight="min(30rem, calc(100dvh - 2rem))"
        footer={<Button label="Close search" variant="ghost" onClick={() => setOpen(false)} />}
        input={<CommandPaletteInput placeholder="Search names, emails, employers, partners, jobs…" />}
        emptyBootstrapText="Type to search members, employers, partners, and jobs"
        emptySearchText={searchError ? <Text role="alert">{searchError}</Text> : 'No matching results'}
        onValueChange={(id) => {
          const href = searchSource.resolveHref(id);
          if (!href) return;
          setOpen(false);
          router.push(href);
        }}
        renderItem={(item) => (
          <>
            <span style={{ flex: 1, minWidth: 0 }}>
              <Text type="body" maxLines={1}>
                {item.label}
              </Text>
              {item.auxiliaryData?.sublabel ? (
                <Text type="supporting" size="sm" maxLines={1}>
                  {item.auxiliaryData.sublabel}
                </Text>
              ) : null}
            </span>
            {item.auxiliaryData?.type ? <Badge label={item.auxiliaryData.type} /> : null}
          </>
        )}
      />
    </>
  );
}
