import Link from 'next/link';
import { LEGAL_DRAFT, type LegalDocument } from '@/config/legal';

/** Renders a Terms/Privacy document from `config/legal.ts`. */
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">{doc.title}</h1>
        <p className="text-ink-muted text-sm">Last updated {doc.version}</p>
        {LEGAL_DRAFT && (
          <p className="border-warning/50 bg-surface text-warning rounded-md border px-3 py-2 text-sm">
            Draft: this document is being finalised and may change before launch.
          </p>
        )}
      </header>

      <nav aria-label="Sections" className="text-sm">
        <ul className="flex flex-col gap-1">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <Link href={`#${s.id}`} className="text-ink-muted hover:text-ink">
                {s.heading}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="flex scroll-mt-6 flex-col gap-3">
          <h2 className="text-lg font-semibold">{s.heading}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="text-ink text-sm leading-relaxed">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
