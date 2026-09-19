import LocalizedLink from '@/components/LocalizedLink';
import { getProgramDisplayPartner, getProgramDisplayTitle, type Program } from '@/lib/content/programs';

export default function ProgramRelatedSection({ programs }: { programs: Program[] }) {
  if (programs.length === 0) return null;

  return (
    <section className="program-related" aria-labelledby="program-related-heading">
      <h2 id="program-related-heading" className="program-related__title">
        Related programs
      </h2>
      <p className="program-related__lead">
        Explore other tracks in the same focus area or with overlapping skills — each links to a full program page.
      </p>
      <ul className="program-related__grid">
        {programs.map((p) => (
          <li key={p.slug}>
            <article className="program-related__card">
              <p className="program-related__cat">{p.categoryLabel}</p>
              <h3 className="program-related__name">
                <LocalizedLink href={`/programs/${p.slug}`}>{getProgramDisplayTitle(p)}</LocalizedLink>
              </h3>
              <p className="program-related__meta">
                {getProgramDisplayPartner(p)} · {p.duration}
              </p>
              <div className="program-related__actions">
                <LocalizedLink href={`/programs/${p.slug}`} className="btn btn-outline btn-sm">
                  Program detail
                </LocalizedLink>
                <LocalizedLink href={`/apply?program=${p.slug}`} className="btn btn-primary btn-sm">
                  Apply
                </LocalizedLink>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
