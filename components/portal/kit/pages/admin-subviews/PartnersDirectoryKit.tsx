import Link from 'next/link';
import { Handshake, Building2, HeartHandshake, Users, Plus, GraduationCap } from 'lucide-react';
import { partnerDirectoryMeta } from '@/lib/partner/adminSchoolPartner';
import { Link as AstryxLink } from '@astryxdesign/core/Link';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  KitEmptyState,
  colorVar,
  type KpiItem,
  type KitColor,
} from '@/components/portal/kit';
import { PARTNERS_DIRECTORY_EMPTY } from '@/lib/admin/directoryEmptyState';

/**
 * Partners directory — responsive card grid of partner orgs (workforce centers,
 * nonprofits, referral orgs). Mockup: workforceap-admin-full.html "partners"
 * view: a 1/2/3-col card grid where each card is an icon tile, the partner
 * name, a "{N} referrals · {N} placed" line, and a footer row of status + a
 * green "{X}% placement". Topped with a KPI strip of real aggregates.
 * Target route: /admin/partners (DEFAULT render).
 *
 * Pure presentational + a couple of Astryx <Button> CTAs — no client state, so
 * this stays a server component (no 'use client').
 */
export interface PartnerCard {
  id: string;
  name: string;
  /** Stable slug used for the manage link. */
  slug: string;
  referrals: number;
  placed: number;
  /** True when active && status === 'active'. */
  active: boolean;
  /** Raw partner.status (active, pending_approval, inactive, rejected). */
  status: string;
  partnerType?: string | null;
  referralCode?: string | null;
  enrollmentPageEnabled?: boolean;
  sponsoredEnrollment?: boolean;
}

export interface PartnersDirectoryKitProps {
  partners?: PartnerCard[];
  /** Total partner count (may exceed the rendered page). */
  total?: number;
  /** Org-wide referral count. Falls back to the rendered page sum. */
  totalReferrals?: number;
  /** Org-wide placed count. Falls back to the rendered page sum. */
  totalPlaced?: number;
}

/** Demo data so the kit renders standalone (matches the mockup numbers). */
const DEFAULT_PARTNERS: PartnerCard[] = [
  { id: '1', name: 'Austin Workforce Board', slug: 'austin-workforce-board', referrals: 142, placed: 38, active: true, status: 'active' },
  { id: '2', name: 'Goodwill Central TX', slug: 'goodwill-central-tx', referrals: 88, placed: 21, active: true, status: 'active' },
  { id: '3', name: 'Veterans Resource Center', slug: 'veterans-resource-center', referrals: 54, placed: 19, active: true, status: 'active' },
];

/** Placement rate (placed / referrals) as a whole percent; 0 when no referrals. */
function placementPct(p: { referrals: number; placed: number }): number {
  if (p.referrals <= 0) return 0;
  return Math.round((p.placed / p.referrals) * 100);
}

/** Status → Token color + label (mirrors StatusTag's tone→color mapping: warn=gold, alert=crimson, muted=gray). */
function statusToken(p: PartnerCard): { color: TokenColor; label: string } {
  if (p.status === 'pending_approval') return { color: 'yellow', label: 'Pending' };
  if (p.status === 'rejected') return { color: 'pink', label: 'Rejected' };
  if (p.active) return { color: 'gray', label: 'Active' };
  return { color: 'gray', label: 'Inactive' };
}

/**
 * Deterministically vary the icon-tile accent across cards so the grid reads
 * like the mockup (crimson / green / info) rather than a wall of one color.
 */
const TILE_PALETTE: { color: KitColor; bg: string }[] = [
  { color: 'accent', bg: 'rgba(173, 44, 77, 0.10)' },
  { color: 'success', bg: 'rgba(74, 155, 79, 0.10)' },
  { color: 'info', bg: 'rgba(43, 123, 185, 0.10)' },
  { color: 'gold', bg: 'rgba(164, 127, 56, 0.12)' },
];

const TILE_ICONS = [Building2, HeartHandshake, Users, Handshake];

export function PartnersDirectoryKit({
  partners = DEFAULT_PARTNERS,
  total,
  totalReferrals: totalReferralsProp,
  totalPlaced: totalPlacedProp,
}: PartnersDirectoryKitProps) {
  const count = total ?? partners.length;
  const pageReferrals = partners.reduce((sum, p) => sum + p.referrals, 0);
  const pagePlaced = partners.reduce((sum, p) => sum + p.placed, 0);
  const totalReferrals = totalReferralsProp ?? pageReferrals;
  const totalPlaced = totalPlacedProp ?? pagePlaced;
  const avgPlacement = totalReferrals > 0 ? Math.round((totalPlaced / totalReferrals) * 100) : 0;

  const kpis: KpiItem[] = [
    { label: 'Partners', value: count },
    { label: 'Referrals', value: totalReferrals.toLocaleString() },
    { label: 'Placed', value: totalPlaced.toLocaleString(), color: 'success' },
    { label: 'Avg placement rate', value: `${avgPlacement}%`, color: 'success' },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        kicker="Partners"
        title="Partners"
        lede="Workforce centers, nonprofits, referral orgs, and partner schools"
        action={
          <AstryxLink as={Link as never} href="/admin/partners/new" isStandalone>
            <Button label="Add Partner" variant="primary" size="sm" icon={<Plus size={14} aria-hidden="true" />} />
          </AstryxLink>
        }
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} cols={4} />
      </div>

      {partners.length === 0 ? (
        <div className="wa-kit-card">
          <KitEmptyState
            title={PARTNERS_DIRECTORY_EMPTY.title}
            description={PARTNERS_DIRECTORY_EMPTY.description}
            action={
              <Link
                href={PARTNERS_DIRECTORY_EMPTY.primaryCta.href}
                className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
              >
                {PARTNERS_DIRECTORY_EMPTY.primaryCta.label}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {[...partners]
            .sort((a, b) => {
              const schoolDelta = Number(partnerDirectoryMeta(b).isSchool) - Number(partnerDirectoryMeta(a).isSchool);
              if (schoolDelta !== 0) return schoolDelta;
              return a.name.localeCompare(b.name);
            })
            .map((p, i) => {
            const tile = TILE_PALETTE[i % TILE_PALETTE.length];
            const meta = partnerDirectoryMeta(p);
            const Icon = meta.isSchool ? GraduationCap : TILE_ICONS[i % TILE_ICONS.length];
            const tag = statusToken(p);
            const pct = placementPct(p);
            return (
              <Link
                key={p.id}
                href={`/admin/partners/${p.id}`}
                className="wa-kit-card--hover wa-kit-focus"
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: tile.bg,
                        color: colorVar(tile.color),
                      }}
                    >
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {meta.isSchool ? <Token label="School" size="sm" color="blue" /> : null}
                      <Token label={tag.label} size="sm" color={tag.color} />
                    </div>
                  </div>

                  <h4 style={{ fontWeight: 800, fontSize: 15, marginTop: 12 }}>{p.name}</h4>
                  <p style={{ fontSize: 11, color: 'var(--wa-muted)', marginTop: 2 }}>
                    {p.referrals.toLocaleString()} referrals · {p.placed.toLocaleString()} placed
                  </p>
                  {meta.isSchool || meta.enrollPath || meta.referralCode ? (
                    <p style={{ fontSize: 11, color: 'var(--wa-muted)', marginTop: 4 }}>
                      {[
                        meta.referralCode ? `ref ${meta.referralCode}` : null,
                        meta.enrollPath,
                      ].filter(Boolean).join(' · ') || 'School partner'}
                    </p>
                  ) : null}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: '1px solid var(--wa-border)',
                    }}
                  >
                    <span style={{ color: 'var(--wa-muted)' }}>{tag.label}</span>
                    <span style={{ fontWeight: 700, color: 'var(--wa-success)' }}>{pct}% placement</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </DesignSurface>
  );
}
