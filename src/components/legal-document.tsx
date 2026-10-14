import Link from 'next/link';
import { LEGAL_DRAFT, type LegalDocument } from '@/config/legal';
import { SplitLines } from '@/components/motion/split-lines';

/**
 * Renders a Terms/Privacy document from `config/legal.ts` (DesignPlan §4 B.2,
 * Legal): on the ground, a Fraunces title, Inter 17/1.6 body in a 720px column
 * and the sections as press-in links. No motion beyond the title.
 */
export function LegalDocumentView({ doc }: { doc: LegalDocument }) {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-4 pt-8 pb-16 sm:pt-16">
      <header className="flex flex-col gap-4">
        <SplitLines
          as="h1"
          className="font-display m-0 text-[56px] leading-[.8] font-normal tracking-[-0.04em] sm:text-[72px]"
        >
          {doc.title}
        </SplitLines>
        <p className="font-label text-ink-muted m-0 text-[15px] tracking-[1px] uppercase">
          Last updated {doc.version}
        </p>
        {LEGAL_DRAFT && (
          <p className="bg-blush text-on-blush m-0 rounded-[8px] px-4 py-3 text-[15px]">
            Draft: this document is being finalised and may change before launch.
          </p>
        )}
      </header>

      <nav aria-label="Sections">
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <Link
                href={`#${s.id}`}
                className="press inline-flex min-h-11 items-center rounded-[8px] px-3 text-[15px]"
              >
                {s.heading}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="flex scroll-mt-6 flex-col gap-4">
          <h2 className="font-display m-0 text-[32px] leading-[1.05] font-normal tracking-[-0.02em]">
            {s.heading}
          </h2>
          {s.paragraphs.map((p, i) => (
            <p key={i} className="m-0 text-[17px] leading-[1.6]">
              {p}
            </p>
          ))}
        </section>
      ))}
    </main>
  );
}
