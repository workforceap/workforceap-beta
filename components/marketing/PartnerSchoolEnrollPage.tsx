import Link from 'next/link';
import {
  BarChart3,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  GraduationCap,
  HelpCircle,
  Laptop,
  Rocket,
  Search,
  Shield,
  Star,
} from 'lucide-react';
import type { EnrollmentPageModel } from '@/lib/enroll/resolveEnrollmentPartner';
import { partnerApplyHref, partnerProgramHref } from '@/lib/apply/partnerApplyHref';
import EnrollRefCookie from './EnrollRefCookie';

const ICONS = {
  'bar-chart': BarChart3,
  briefcase: Briefcase,
  'check-circle': CheckCircle2,
  clock: Clock,
  'file-text': FileText,
  'graduation-cap': GraduationCap,
  'help-circle': HelpCircle,
  laptop: Laptop,
  rocket_launch: Rocket,
  search: Search,
  shield: Shield,
  star: Star,
} as const;

function Icon({ name, size }: { name: string; size: number }) {
  const Cmp = ICONS[name as keyof typeof ICONS] ?? Briefcase;
  return <Cmp size={size} aria-hidden="true" />;
}

function categoryTone(color: string): 'c' | 'g' {
  return /ad2c4d|crimson|c47/i.test(color) ? 'c' : 'g';
}

export default function PartnerSchoolEnrollPage({ model }: { model: EnrollmentPageModel }) {
  const applyBase = partnerApplyHref(model.referralCode);
  const applyUrl = (slug: string) => partnerApplyHref(model.referralCode, slug);
  const programUrl = (slug: string) => partnerProgramHref(model.referralCode, slug);
  const shortName = model.name.replace(/ High School$/i, '');
  const programCountLabel = model.programs.length === 1 ? 'program' : 'programs';

  const steps = [
    { num: '1', icon: 'search', title: 'Review the programs', desc: `Browse the certificate tracks below and pick the one that fits your interests.` },
    { num: '2', icon: 'file-text', title: 'Apply in about 10 minutes', desc: 'One short online application. No payment information is ever requested.' },
    { num: '3', icon: 'check-circle', title: 'We enroll you in your program', desc: `Allow 24–48 hours for WorkforceAP to enroll you into your chosen program — it's a manual setup process.` },
    { num: '4', icon: 'rocket_launch', title: 'Start training', desc: 'Self-paced and flexible — built to fit around your class schedule and activities.' },
  ];

  const faqs: { q: string; a: string; href?: string; hrefLabel?: string }[] = [
    {
      q: 'What does it cost?',
      a: `${model.costSentence} Students and families are never asked for payment information.`,
    },
    {
      q: "I'm under 18 — can I apply?",
      a: `Yes — apply now. ${shortName} collects a parent/guardian consent form before your training is activated.`,
    },
    {
      q: 'What do I need to apply?',
      a: `Your name, grade, and how we can reach you. If you are under 18, a parent or guardian name and email. We do not ask about jobs or household income — high school students are not employed, and this seat is already sponsored.`,
    },
    {
      q: 'How long does a program take?',
      a: 'Every program is self-paced and flexible — built to fit around your school schedule. Typical durations are shown on each program card above.',
    },
    {
      q: 'Questions?',
      a: `Talk to your ${shortName} counselor, or reach the WorkforceAP team any time through our contact page.`,
      href: '/contact',
      hrefLabel: 'Visit /contact',
    },
  ];

  return (
    <div className="enroll-school">
      <EnrollRefCookie referralCode={model.referralCode} />

      <section className="stage">
        <div className="aura aura--1" aria-hidden="true" />
        <div className="aura aura--2" aria-hidden="true" />
        <div className="aura aura--3" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />

        <div className="wrap stage-grid">
          <div className="lede">
            <span className="pill">
              <span className="pill__star"><Icon name="star" size={11} /></span>
              {model.name} Partnership
            </span>
            <h1>
              {shortName} students: launch your career with an <span className="shimmer">industry certification</span>
            </h1>
            <p className="sub">{model.costSentence}</p>
            <div className="acts">
              <Link className="dbtn dbtn--solid" href={applyBase}>Start your application <span>→</span></Link>
              <a className="dbtn dbtn--glass" href="#school-programs">See the programs</a>
            </div>
            <p className="meta-note">About 10 minutes to apply • Program enrollment setup takes 24–48 hours • No payment information requested</p>
          </div>

          <div className="hero-glass">
            <div className="hg-tag">WorkforceAP × {model.name}</div>
            <div className="hg-meter">
              <span>Certificate {programCountLabel} for {shortName} students</span>
              <strong>{model.programs.length}</strong>
            </div>
            <div className="hg-rows">
              <div className="hg-row"><Icon name="graduation-cap" size={16} /> Industry-recognized certifications</div>
              <div className="hg-row"><Icon name="laptop" size={16} /> Self-paced and flexible</div>
              <div className="hg-row"><Icon name="shield" size={16} /> No cost to {shortName} students for {model.termLabel}</div>
            </div>
            <div className="hg-chips">
              <span>Sponsored partnership</span>
              <span>{model.termLabel} program year</span>
              {model.schoolDistrict ? <span>{model.schoolDistrict}</span> : null}
            </div>
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">How it works</span>
            <h2>Four steps from here <span className="grad-text">to certified</span></h2>
            <p>Your school and WorkforceAP handle the paperwork — you focus on the training.</p>
          </div>
          <div className="steps">
            {steps.map((s) => (
              <div className="stepcard" key={s.num}>
                <div className="num">{s.num}</div>
                <span className="step-ic"><Icon name={s.icon} size={20} /></span>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band band--surface" id="school-programs">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Your programs</span>
            <h2>
              {model.programs.length} certificate {programCountLabel}, <span className="grad-text">picked for {shortName}</span>
            </h2>
            <p>
              Every track is self-paced and flexible — built to fit around your school schedule — ends in an
              industry-recognized certificate, and is sponsored for {model.name} students in {model.termLabel}.
            </p>
          </div>
          <div className="pgrid">
            {model.programs.map((p) => (
              <div className="pcard" key={p.slug}>
                <div className="pcard-top">
                  <div className="ptags">
                    <span className={`cat-pill cat--${categoryTone(p.categoryColor)}`}>{p.category}</span>
                    <span className="fund-pill">Sponsored for {model.termLabel}</span>
                  </div>
                  <span className="picon"><Icon name={p.icon} size={26} /></span>
                </div>
                <h3><Link href={applyUrl(p.slug)}>{p.title}</Link></h3>
                <div className="pmeta">
                  <span><Icon name="clock" size={16} /> {p.duration}</span>
                </div>
                <p className="pdisc">
                  <a href="/salary-guide">Research pay and job requirements</a> for the occupations you want to explore.
                </p>
                <div className="pskills">{p.skills.map((s) => <span className="stag" key={s}>{s}</span>)}</div>
                <div className="pcard-foot">
                  <span className="ppartner">Sponsored by {shortName}</span>
                  <span className="pcert">Certificate: {p.partner}</span>
                  <div className="pacts">
                    <Link className="btn btn-secondary btn-sm" href={programUrl(p.slug)}>View Program</Link>
                    <Link className="btn btn-primary btn-sm" href={applyUrl(p.slug)}>Get Started →</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">Good to know</span>
            <h2>Questions students <span className="grad-text">and families ask</span></h2>
          </div>
          <div className="faq">
            {faqs.map((f) => (
              <details className="faq-item" key={f.q}>
                <summary>
                  <span className="faq-q"><span className="faq-ic"><Icon name="help-circle" size={16} /></span>{f.q}</span>
                  <span className="faq-chev"><ChevronDown size={18} aria-hidden="true" /></span>
                </summary>
                <p className="faq-a">
                  {f.a}
                  {f.href ? <> <Link href={f.href}>{f.hrefLabel}</Link></> : null}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="close">
        <div className="close__media" aria-hidden="true" />
        <div className="close__veil" aria-hidden="true" />
        <div className="close__inner wrap">
          <span className="pill pill--solid">
            <span className="pill__star"><Icon name="star" size={11} /></span>
            WorkforceAP × {model.name}
          </span>
          <h2>Your certification starts here</h2>
          <p>{model.costSentence} Apply in about 10 minutes.</p>
          <div className="acts acts--center">
            <Link className="bbtn bbtn--gold" href={applyBase}>Start your application →</Link>
            <a className="bbtn bbtn--outline" href="#school-programs">See the programs</a>
          </div>
        </div>
      </section>
    </div>
  );
}
