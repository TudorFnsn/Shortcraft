import Link from 'next/link';
import { LEGAL_DRAFT, type LegalDocument } from '@/config/legal';

/** Renders a Terms/Privacy document from `config/legal.ts`. */
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{doc.title}</h1>
        <p className="text-sm text-neutral-400">Last updated {doc.version}</p>
        {LEGAL_DRAFT && (
          <p className="rounded-md border border-amber-700 bg-amber-950 px-3 py-2 text-sm text-amber-200">
            Draft: this document is being finalised and may change before launch.
          </p>
        )}
      </header>

      <nav aria-label="Sections" className="text-sm">
        <ul className="flex flex-col gap-1">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <Link href={`#${s.id}`} className="text-neutral-400 hover:text-white">
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
            <p key={i} className="text-sm leading-relaxed text-neutral-300">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
