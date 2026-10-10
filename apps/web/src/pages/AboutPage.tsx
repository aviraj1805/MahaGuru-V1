import { useNavigate } from 'react-router-dom';
import { PageShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/primitives';

const BELIEFS = [
  {
    title: 'Clarity comes before plans',
    body: 'A roadmap is only useful once a student knows why they want it. We start with understanding, then move to execution.',
  },
  {
    title: 'Every student deserves a personal guide',
    body: 'One-to-one mentorship and tutoring work, but they have never been affordable at scale. AI can change that if it is built responsibly.',
  },
  {
    title: 'Trust is earned in the open',
    body: 'Our code, prompts, dataset and evaluation suite are public. Anyone can inspect how the product behaves and why.',
  },
];

const FACTS = [
  ['2', 'products: StudentGPT and Classroom'],
  ['24', 'evaluation scenarios, including crisis cases'],
  ['39', 'authored reference dialogues that guide the mentor'],
  ['MIT', 'open-source licence for the full platform'],
];

export default function AboutPage() {
  const navigate = useNavigate();
  return (
    <PageShell>
      <header className="border-b border-line">
        <div className="container-page py-16 sm:py-20">
          <p className="eyebrow text-brand">About</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Building the guidance every student should have had.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            MahaGuru AI exists for college students across India who are capable, ambitious and unsure where to begin. We
            combine reflective mentorship with personalised learning so that confusion turns into a direction, and a
            direction turns into skill.
          </p>
        </div>
      </header>

      <section className="container-page section grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="eyebrow text-brand">Mission</p>
          <h2 className="section-title mt-3">Make personal guidance available to every student.</h2>
        </div>
        <div className="space-y-5 text-lg leading-relaxed text-muted">
          <p>
            Most students make their biggest decisions with little individual support. Career counsellors are scarce,
            coaching is expensive, and generic advice rarely fits a specific life.
          </p>
          <p>
            We are building an AI mentor that listens before it advises, and an AI classroom that teaches at each
            student’s level. Both are designed around evidence from learning science and with safety built in from the
            first message.
          </p>
        </div>
      </section>

      <section className="border-y border-line bg-sunken">
        <div className="container-page section">
          <p className="eyebrow text-brand">What we believe</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {BELIEFS.map((b) => (
              <div key={b.title} className="rounded-xl border border-line bg-surface p-7">
                <h3 className="font-semibold">{b.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page section">
        <p className="eyebrow text-brand">At a glance</p>
        <dl className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map(([value, label]) => (
            <div key={label} className="flex flex-col bg-surface p-6">
              <dt className="order-2 mt-2 text-sm text-muted">{label}</dt>
              <dd className="order-1 text-3xl font-semibold tracking-tight">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-16 flex flex-col gap-6 border-t border-line pt-10 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Contribute or get in touch</h2>
            <p className="mt-2 text-muted">Report an issue, suggest an improvement or contribute code on GitHub.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => window.open('https://github.com/aviraj1805/MahaGuru-V1', '_blank', 'noreferrer')}>
              View on GitHub
            </Button>
            <Button onClick={() => navigate('/reflect')}>Try StudentGPT</Button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
