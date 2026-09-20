'use client';

import { useMemo, useState } from 'react';
import SignaturePad, { type SignatureValue } from '@/components/admin/SignaturePad';
import BillingPacketList from '@/components/billing/BillingPacketList';
import type { BillingPacketSummary } from '@/lib/billing/packetAccess';
import type { PacketLineItem } from '@/lib/billing/packetSchema';
import { defaultCoverLetterBody, formatMoney, isoDatePlusDays, totalContactHours } from '@/lib/billing/packetText';
import { programDisplayTitle } from '@/lib/content/programTitle';

export type BillingProgramOption = {
  slug: string;
  title: string;
  lineItems: PacketLineItem[];
  pricingSource: 'organization_catalog' | 'syllabus' | 'price_list_default';
  isPrimary: boolean;
};

type BillingPacketClientProps = {
  memberId: string;
  memberName: string;
  memberEmail: string;
  programs: BillingProgramOption[];
  billTo: { name: string; attention: string; address: string };
  signer: { name: string; title: string };
  providerName: string;
  counselorLabel: string | null;
  initialPackets: BillingPacketSummary[];
};

const PRICING_SOURCE_LABEL: Record<BillingProgramOption['pricingSource'], string> = {
  organization_catalog: 'prices from your program catalog (/admin/programs)',
  syllabus: 'tuition from the approved TWC syllabus',
  price_list_default: 'price-list default of $7,500 spread across the classes',
};

type Draft = {
  programSlug: string;
  invoiceDate: string;
  dueDate: string;
  billToName: string;
  billToAttention: string;
  billToAddress: string;
  billToEmail: string;
  referenceNumber: string;
  lineItems: PacketLineItem[];
  coverLetterBody: string;
  signerName: string;
  signerTitle: string;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 42,
  padding: '0.5rem 0.65rem',
  border: '1px solid var(--outline-variant, #cbd5e1)',
  borderRadius: 8,
  fontSize: '0.95rem',
  background: '#fff',
};
const labelStyle: React.CSSProperties = { display: 'grid', gap: '0.3rem', fontSize: '0.85rem', fontWeight: 600 };

export default function BillingPacketClient(props: BillingPacketClientProps) {
  const initialProgram = props.programs.find((p) => p.isPrimary) ?? props.programs[0] ?? null;
  const [packets, setPackets] = useState<BillingPacketSummary[]>(props.initialPackets);
  const [signature, setSignature] = useState<SignatureValue>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [lastCreated, setLastCreated] = useState<BillingPacketSummary | null>(null);

  const buildLetter = (programSlug: string, lineItems: PacketLineItem[], billToName: string, referenceNumber: string) => {
    const program = props.programs.find((p) => p.slug === programSlug);
    return defaultCoverLetterBody({
      memberName: props.memberName,
      programTitle: program?.title ?? programDisplayTitle(programSlug),
      billToName: billToName || 'the funding partner',
      lineItems,
      providerName: props.providerName,
      referenceNumber: referenceNumber || undefined,
    });
  };

  const [draft, setDraft] = useState<Draft>(() => {
    const lineItems = initialProgram?.lineItems ?? [];
    return {
      programSlug: initialProgram?.slug ?? '',
      invoiceDate: isoDatePlusDays(0),
      dueDate: isoDatePlusDays(30),
      billToName: props.billTo.name,
      billToAttention: props.billTo.attention,
      billToAddress: props.billTo.address,
      billToEmail: '',
      referenceNumber: '',
      lineItems,
      coverLetterBody: initialProgram
        ? defaultCoverLetterBody({
            memberName: props.memberName,
            programTitle: initialProgram.title,
            lineItems,
            billToName: props.billTo.name,
            providerName: props.providerName,
          })
        : '',
      signerName: props.signer.name,
      signerTitle: props.signer.title,
    };
  });

  const total = useMemo(() => draft.lineItems.reduce((s, r) => s + (Number.isFinite(r.amount) ? r.amount : 0), 0), [draft.lineItems]);
  const hours = useMemo(() => totalContactHours(draft.lineItems), [draft.lineItems]);
  const selectedProgram = props.programs.find((p) => p.slug === draft.programSlug) ?? null;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const changeProgram = (slug: string) => {
    const program = props.programs.find((p) => p.slug === slug);
    const lineItems = program?.lineItems ?? [];
    setDraft((d) => ({ ...d, programSlug: slug, lineItems, coverLetterBody: buildLetter(slug, lineItems, d.billToName, d.referenceNumber) }));
  };

  const updateRow = (index: number, patch: Partial<PacketLineItem>) =>
    setDraft((d) => ({ ...d, lineItems: d.lineItems.map((row, i) => (i === index ? { ...row, ...patch } : row)) }));
  const removeRow = (index: number) => setDraft((d) => ({ ...d, lineItems: d.lineItems.filter((_, i) => i !== index) }));
  const addRow = (kind: 'class' | 'fee') =>
    setDraft((d) => ({ ...d, lineItems: [...d.lineItems, { description: '', hours: kind === 'class' ? 0 : null, amount: 0 }] }));
  const resetRows = () => selectedProgram && set('lineItems', selectedProgram.lineItems);
  const resetLetter = () => set('coverLetterBody', buildLetter(draft.programSlug, draft.lineItems, draft.billToName, draft.referenceNumber));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!signature) {
      setMsg({ type: 'err', text: 'Sign the documents first (draw your signature or type your name).' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/members/${props.memberId}/billing-packets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programSlug: draft.programSlug,
          invoiceDate: draft.invoiceDate,
          dueDate: draft.dueDate || null,
          billToName: draft.billToName,
          billToAttention: draft.billToAttention,
          billToAddress: draft.billToAddress,
          billToEmail: draft.billToEmail,
          referenceNumber: draft.referenceNumber,
          lineItems: draft.lineItems.map((row) => ({
            description: row.description,
            hours: row.hours == null || Number.isNaN(row.hours) ? null : row.hours,
            amount: Number.isFinite(row.amount) ? row.amount : 0,
          })),
          coverLetterBody: draft.coverLetterBody,
          signerName: draft.signerName,
          signerTitle: draft.signerTitle,
          signatureImage: signature.kind === 'drawn' ? signature.dataUrl : null,
          signatureTyped: signature.kind === 'typed',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; packet?: BillingPacketSummary };
      if (!res.ok || !data.packet) throw new Error(data.error ?? 'Could not create the documents.');
      setPackets((list) => [data.packet as BillingPacketSummary, ...list]);
      setLastCreated(data.packet);
      setSignature(null);
      setMsg({ type: 'ok', text: `Invoice ${data.packet.packetNumber} signed. Review the PDFs below, then email them to the counselor and student.` });
      document.getElementById('billing-packet-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Could not create the documents.' });
    } finally {
      setSaving(false);
    }
  }

  const onPacketUpdated = (updated: BillingPacketSummary) => setPackets((list) => list.map((p) => (p.id === updated.id ? updated : p)));

  return (
    <div style={{ display: 'grid', gap: '1.5rem', maxWidth: 900 }}>
      <section id="billing-packet-list" className="portal-profile-section-card">
        <div className="portal-profile-section-card__header">
          <h2 className="portal-profile-section-card__title">Signed packets</h2>
        </div>
        <div className="portal-profile-section-card__body">
          {lastCreated ? (
            <p role="status" style={{ margin: '0 0 0.75rem', fontWeight: 600, color: 'var(--color-green, #15803d)' }}>
              Invoice {lastCreated.packetNumber} is ready. Next step: press &ldquo;Email to counselor and student&rdquo;.
            </p>
          ) : null}
          <BillingPacketList
            packets={packets}
            canSend
            counselorLabel={props.counselorLabel}
            memberEmail={props.memberEmail}
            onPacketUpdated={onPacketUpdated}
            emptyText="No J5/J6 packets for this member yet. Create the first one below."
          />
        </div>
      </section>

      <form onSubmit={handleSubmit} className="portal-profile-section-card" noValidate>
        <div className="portal-profile-section-card__header">
          <h2 className="portal-profile-section-card__title">Create a new J5 invoice + J6 cover letter</h2>
        </div>
        <div className="portal-profile-section-card__body" style={{ display: 'grid', gap: '1.25rem' }}>
          {props.programs.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--color-accent, #ad2c4d)', fontWeight: 600 }}>
              This member is not enrolled in a program yet. Assign a program from the member page first.
            </p>
          ) : null}

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={labelStyle}>
              Program
              <select style={inputStyle} value={draft.programSlug} onChange={(e) => changeProgram(e.target.value)} disabled={props.programs.length === 0}>
                {props.programs.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.title}
                    {p.isPrimary ? ' (primary)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Invoice date
              <input type="date" style={inputStyle} value={draft.invoiceDate} onChange={(e) => set('invoiceDate', e.target.value)} required />
            </label>
            <label style={labelStyle}>
              Due date
              <input type="date" style={inputStyle} value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
            </label>
            <label style={labelStyle}>
              Board / ITA / voucher reference
              <input style={inputStyle} value={draft.referenceNumber} onChange={(e) => set('referenceNumber', e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            <legend style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Bill to (funding partner)</legend>
            <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <label style={labelStyle}>
                Organization
                <input style={inputStyle} value={draft.billToName} onChange={(e) => set('billToName', e.target.value)} required />
              </label>
              <label style={labelStyle}>
                Attention
                <input style={inputStyle} value={draft.billToAttention} onChange={(e) => set('billToAttention', e.target.value)} placeholder="Accounts Payable" />
              </label>
              <label style={labelStyle}>
                Email (printed on invoice)
                <input type="email" style={inputStyle} value={draft.billToEmail} onChange={(e) => set('billToEmail', e.target.value)} placeholder="Optional" />
              </label>
            </div>
            <label style={labelStyle}>
              Mailing address
              <textarea style={{ ...inputStyle, minHeight: 70 }} value={draft.billToAddress} onChange={(e) => set('billToAddress', e.target.value)} placeholder={'Street\nCity, ST ZIP'} />
            </label>
          </fieldset>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
              <strong>Classes and price breakdown</strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--color-muted, #64748b)' }}>
                {selectedProgram ? `Prefilled with ${PRICING_SOURCE_LABEL[selectedProgram.pricingSource]}. Edit any row.` : ''}
              </span>
            </div>
            <div role="group" aria-label="Invoice line items" style={{ display: 'grid', gap: '0.4rem' }}>
              <div
                aria-hidden="true"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 120px 140px 44px',
                  gap: '0.5rem',
                  padding: '0 0.3rem',
                  color: 'var(--color-muted, #64748b)',
                  fontSize: '0.8125rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
                className="billing-row-head"
              >
                <span>Class / item</span>
                <span>Contact hours</span>
                <span>Amount (USD)</span>
                <span />
              </div>
              {draft.lineItems.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 120px 140px 44px',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.15rem 0.3rem',
                  }}
                >
                  <input aria-label={`Item ${i + 1} description`} style={inputStyle} value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} required />
                  <input
                    aria-label={`Item ${i + 1} contact hours`}
                    type="number"
                    min={0}
                    step="0.5"
                    style={inputStyle}
                    value={row.hours ?? ''}
                    placeholder="n/a"
                    onChange={(e) => updateRow(i, { hours: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                  <input
                    aria-label={`Item ${i + 1} amount`}
                    type="number"
                    min={0}
                    step="0.01"
                    style={inputStyle}
                    value={Number.isFinite(row.amount) ? row.amount : ''}
                    onChange={(e) => updateRow(i, { amount: e.target.value === '' ? 0 : Number(e.target.value) })}
                    required
                  />
                  <button type="button" className="btn btn-outline" style={{ minHeight: 36, minWidth: 36, padding: '0 0.5rem' }} onClick={() => removeRow(i)} aria-label={`Remove item ${i + 1}`}>
                    &times;
                  </button>
                </div>
              ))}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 120px 140px 44px',
                  gap: '0.5rem',
                  padding: '0.5rem 0.3rem',
                  fontWeight: 700,
                  borderTop: '1px solid var(--outline-variant, #cbd5e1)',
                }}
              >
                <span style={{ textAlign: 'right' }}>Totals</span>
                <span>{hours} hrs</span>
                <span>{formatMoney(total)}</span>
                <span />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} onClick={() => addRow('class')}>
                Add class
              </button>
              <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} onClick={() => addRow('fee')}>
                Add fee
              </button>
              <button type="button" className="btn btn-outline" style={{ minHeight: 38 }} onClick={resetRows} disabled={!selectedProgram}>
                Reset to program default
              </button>
            </div>
          </div>

          <label style={labelStyle}>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
              J6 cover letter body
              <button type="button" className="btn btn-outline" style={{ minHeight: 32, fontSize: '0.8125rem' }} onClick={resetLetter}>
                Regenerate from the rows above
              </button>
            </span>
            <textarea
              style={{ ...inputStyle, minHeight: 240, fontFamily: 'inherit', lineHeight: 1.5 }}
              value={draft.coverLetterBody}
              onChange={(e) => set('coverLetterBody', e.target.value)}
              required
            />
            <span style={{ fontSize: '0.8125rem', color: 'var(--color-muted, #64748b)', fontWeight: 400 }}>
              Date, addressee, RE line, salutation, closing and signature are added automatically. Start lines with &ldquo;- &rdquo; for bullets.
            </span>
          </label>

          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <label style={labelStyle}>
              Signer name
              <input style={inputStyle} value={draft.signerName} onChange={(e) => set('signerName', e.target.value)} required />
            </label>
            <label style={labelStyle}>
              Signer title
              <input style={inputStyle} value={draft.signerTitle} onChange={(e) => set('signerTitle', e.target.value)} required />
            </label>
          </div>

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <strong>Signature</strong>
            <SignaturePad signerName={draft.signerName} value={signature} onChange={setSignature} />
          </div>

          {msg ? (
            <p role="status" style={{ margin: 0, fontWeight: 600, color: msg.type === 'ok' ? 'var(--color-green, #15803d)' : 'var(--color-accent, #ad2c4d)' }}>
              {msg.text}
            </p>
          ) : null}

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" className="btn" style={{ minHeight: 46, padding: '0 1.25rem' }} disabled={saving || props.programs.length === 0 || draft.lineItems.length === 0}>
              {saving ? 'Creating…' : `Create signed J5 + J6 (${formatMoney(total)})`}
            </button>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-muted, #64748b)' }}>
              Creates both PDFs with your signature. Emailing is a separate button so you can review first.
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}
