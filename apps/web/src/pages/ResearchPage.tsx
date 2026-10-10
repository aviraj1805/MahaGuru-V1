import { Link } from 'react-router-dom';
import { PageShell } from '@/components/layout/AppShell';

const FACTS = [
  {
    value: '4.33 crore',
    body: 'students were enrolled in higher education in India in 2021-22, with a gross enrolment ratio of 28.4%. Few institutions can offer each of them individual guidance.',
    ref: 1,
  },
  {
    value: '51.25%',
    body: 'of young Indians assessed in 2024 were rated highly employable. The gap between a degree and job-ready skill is where structured, personalised learning matters most.',
    ref: 2,
  },
  {
    value: '70 to 92%',
    body: 'of people with mental health conditions in India did not receive treatment, depending on the condition. Students need a first conversation that is safe and points to real help.',
    ref: 3,
  },
];

const PRINCIPLES = [
  {
    title: 'Guided questioning before advice',
    body: 'Motivational interviewing shows that people are more likely to act on reasons they articulate themselves than on instructions. StudentGPT therefore reflects back what it hears and asks one focused question at a time, and avoids premature lists of options.',
    refs: [6],
    where: 'StudentGPT',
  },
  {
    title: 'Autonomy, competence and belonging',
    body: 'Self-determination theory links lasting motivation to three needs: choosing for oneself, feeling capable and feeling understood. Both products leave decisions with the student and make progress visible.',
    refs: [9],
    where: 'StudentGPT and Classroom',
  },
  {
    title: 'One-to-one instruction with mastery checks',
    body: 'Bloom found that students taught one-to-one with corrective feedback performed about two standard deviations above peers in conventional classes. Classroom approximates this with a diagnostic, lessons written for the student’s level and a personal AI teacher.',
    refs: [5],
    where: 'Classroom',
  },
  {
    title: 'Retrieval practice',
    body: 'Taking a test on material produces better long-term retention than studying it again. Every Classroom lesson ends with a practice quiz that prioritises the concepts a student finds hardest.',
    refs: [7],
    where: 'Classroom',
  },
  {
    title: 'Self-explanation',
    body: 'Learners who explain material in their own words build deeper understanding. Quizzes and projects include written answers that are graded against a rubric on reasoning, not keywords.',
    refs: [8],
    where: 'Classroom',
  },
  {
    title: 'Safety by design',
    body: 'Every StudentGPT message passes a deterministic safety screen in English and Hinglish before the model replies. Signs of crisis switch the conversation to a fixed protocol that checks on safety and shows national helplines, including Tele-MANAS.',
    refs: [4],
    where: 'StudentGPT',
  },
];

const THRESHOLDS = [
  ['Average judge score, overall', '4.0 out of 5 or higher'],
  ['Non-crisis conversations free of premature advice', '90% or more'],
  ['Calm mentor turns that end with a question', '85% or more'],
  ['Crisis turns that point to immediate help', '100%'],
];

const REFERENCES = [
  ['Ministry of Education (2024). All India Survey on Higher Education 2021-22. Press Information Bureau.', 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1999713'],
  ['Wheebox (2024). India Skills Report 2024.', 'https://wheebox.com/assets/pdf/ISR_Report_2024.pdf'],
  ['Gururaj, G. et al. (2016). National Mental Health Survey of India, 2015-16: Summary. NIMHANS.', 'https://indianmhs.nimhans.ac.in/phase1/Docs/Summary.pdf'],
  ['Ministry of Health and Family Welfare (2025). Measures taken to improve mental healthcare (National Tele Mental Health Programme). Press Information Bureau.', 'https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2100593'],
  ['Bloom, B. S. (1984). The 2 Sigma Problem: The search for methods of group instruction as effective as one-to-one tutoring. Educational Researcher, 13(6), 4-16.', 'https://doi.org/10.3102/0013189X013006004'],
  ['Miller, W. R., and Rollnick, S. (2013). Motivational Interviewing: Helping People Change (3rd ed.). Guilford Press.', null],
  ['Roediger, H. L., and Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. Psychological Science, 17(3), 249-255.', 'https://doi.org/10.1111/j.1467-9280.2006.01693.x'],
  ['Chi, M. T. H., de Leeuw, N., Chiu, M.-H., and LaVancher, C. (1994). Eliciting self-explanations improves understanding. Cognitive Science, 18(3), 439-477.', 'https://doi.org/10.1207/s15516709cog1803_3'],
  ['Ryan, R. M., and Deci, E. L. (2000). Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being. American Psychologist, 55(1), 68-78.', 'https://doi.org/10.1037/0003-066X.55.1.68'],
] as const;

function Ref({ n }: { n: number }) {
  return (
    <a href={`#ref-${n}`} className="align-super text-[0.7em] font-semibold text-brand hover:underline">
      [{n}]
    </a>
  );
}

export default function ResearchPage() {
  return (
    <PageShell>
      <header className="border-b border-line">
        <div className="container-page py-16 sm:py-20">
          <p className="eyebrow text-brand">Research</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">The research behind MahaGuru AI</h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            The problem we work on, the evidence our product decisions rest on, and how we measure whether StudentGPT
            behaves as intended.
          </p>
        </div>
      </header>

      <section className="container-page section">
        <h2 className="section-title">The problem</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {FACTS.map((f) => (
            <div key={f.value} className="border-t-2 border-ink pt-5">
              <p className="text-3xl font-semibold tracking-tight">{f.value}</p>
              <p className="mt-3 leading-relaxed text-muted">
                {f.body} <Ref n={f.ref} />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-sunken">
        <div className="container-page section">
          <h2 className="section-title">Principles we build on</h2>
          <p className="section-lead max-w-2xl">Each principle maps to a published finding and to a specific part of the product.</p>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <article key={p.title} className="bg-surface p-8">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{p.where}</p>
                <h3 className="mt-3 text-lg font-semibold">{p.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">
                  {p.body} {p.refs.map((r) => <Ref key={r} n={r} />)}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page section grid gap-12 lg:grid-cols-2">
        <div>
          <h2 className="section-title">How we evaluate StudentGPT</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-muted">
            <p>
              Unit and end-to-end tests show that the product works. A separate evaluation harness measures whether the
              mentor behaves as intended with a real language model.
            </p>
            <p>
              The suite contains 24 scenarios: 15 reflective cases (3 in Hinglish), 3 direct requests for advice, 2
              cases of elevated distress and 4 crisis cases. In each, a simulated student holds a hidden root cause and
              reveals it only if the mentor’s questions lead there.
            </p>
            <p>
              Every mentor turn is checked automatically for questions, length, advice patterns and, in crisis turns,
              a pointer to immediate help. A separate model then scores each full conversation from 1 to 5 on depth,
              continuity, warmth, language match and safety.
            </p>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted">Release thresholds</h3>
          <table className="mt-4 w-full text-sm">
            <tbody className="divide-y divide-line border-y border-line">
              {THRESHOLDS.map(([metric, value]) => (
                <tr key={metric}>
                  <td className="py-4 pr-4">{metric}</td>
                  <td className="py-4 text-right font-semibold">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            The harness and scenarios are public in the{' '}
            <a href="https://github.com/aviraj1805/MahaGuru-V1/blob/main/docs/evaluation.md" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">
              evaluation documentation
            </a>
            .
          </p>
        </div>
      </section>

      <section className="border-y border-line bg-sunken">
        <div className="container-page section grid gap-12 lg:grid-cols-2">
          <div>
            <h2 className="section-title">Limitations</h2>
            <p className="section-lead">We state these plainly because students deserve to know them.</p>
          </div>
          <ul className="space-y-4 leading-relaxed text-muted">
            <li><strong className="text-ink">AI can be wrong.</strong> Lessons and replies are generated and may contain errors. Verify important facts.</li>
            <li><strong className="text-ink">Not a clinical service.</strong> StudentGPT does not diagnose or treat. It is a starting point, not a substitute for a counsellor. See <Link to="/safety" className="text-brand hover:underline">safety and support</Link>.</li>
            <li><strong className="text-ink">Simulated evaluation.</strong> Our scenarios use simulated students. They test behaviour, not long-term outcomes.</li>
            <li><strong className="text-ink">Model dependence.</strong> Reply quality depends on the language model configured by the operator.</li>
          </ul>
        </div>
      </section>

      <section className="container-page section">
        <h2 className="section-title">References</h2>
        <ol className="mt-8 space-y-3 text-sm leading-relaxed text-muted">
          {REFERENCES.map(([text, href], i) => (
            <li key={text} id={`ref-${i + 1}`} className="flex gap-3 scroll-mt-24">
              <span className="w-6 shrink-0 font-semibold text-ink">{i + 1}.</span>
              <span>
                {text}{' '}
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    Link
                  </a>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </PageShell>
  );
}
