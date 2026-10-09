import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  FileLock2,
  GitBranch,
  MessageSquareText,
  ShieldCheck,
} from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Button, Card, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Mode = 'reflect' | 'learn';

const MODES: Record<Mode, { label: string; placeholder: string; hint: string; starters: string[] }> = {
  reflect: {
    label: 'StudentGPT',
    placeholder: 'Describe what feels unclear, in your own words',
    hint: 'StudentGPT asks focused questions to help you find the real issue.',
    starters: [
      'I keep switching career goals',
      'My parents want engineering, I prefer design',
      'I feel behind everyone in my batch',
    ],
  },
  learn: {
    label: 'Classroom',
    placeholder: 'What do you want to learn? For example: data analysis with Python',
    hint: 'Classroom assesses your level and builds a personalised roadmap.',
    starters: [
      'Prepare for software engineering interviews',
      'Learn UI and UX design from scratch',
      'Build and deploy a full-stack web app',
    ],
  },
};

function Composer() {
  const [mode, setMode] = useState<Mode>('reflect');
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const m = MODES[mode];

  const go = (value: string) => {
    const v = value.trim();
    if (!v) return;
    navigate(mode === 'reflect' ? `/reflect?start=${encodeURIComponent(v)}` : `/learn/new?goal=${encodeURIComponent(v)}`);
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    go(text);
  };

  return (
    <div className="w-full">
      <div role="tablist" aria-label="Choose a product" className="mb-3 inline-flex rounded-lg border border-line bg-sunken p-1">
        {(Object.keys(MODES) as Mode[]).map((key) => {
          const active = key === mode;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setMode(key)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                active ? 'bg-surface text-ink shadow-soft' : 'text-muted hover:text-ink',
              )}
            >
              {MODES[key].label}
            </button>
          );
        })}
      </div>
      <form onSubmit={onSubmit}>
        <Card className="p-2 transition-shadow focus-within:border-brand/50 focus-within:shadow-lift">
          <Textarea
            autoGrow
            maxRows={6}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                go(text);
              }
            }}
            placeholder={m.placeholder}
            aria-label={m.placeholder}
            maxLength={600}
            className="border-0 bg-transparent text-base focus:ring-0"
          />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <p className="text-xs text-muted">{m.hint}</p>
            <Button
              type="submit"
              size="icon"
              disabled={!text.trim()}
              aria-label={mode === 'reflect' ? 'Start reflecting' : 'Start learning'}
              className="h-9 w-9 shrink-0"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {m.starters.map((s) => (
          <button
            key={s}
            onClick={() => go(s)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:border-ink/25 hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConversationPreview() {
  return (
    <Card className="overflow-hidden shadow-lift">
      <div className="flex items-center justify-between border-b border-line bg-sunken px-5 py-3">
        <span className="text-sm font-semibold">StudentGPT</span>
        <span className="text-xs text-muted">Reflection in progress</span>
      </div>
      <div className="space-y-5 p-5 text-[14.5px] leading-relaxed">
        <div className="ml-auto w-fit max-w-[88%] rounded-lg bg-sunken px-4 py-2.5">
          I keep switching between data science, product and UPSC. What is wrong with me?
        </div>
        <div className="max-w-[94%] border-l-2 border-brand pl-4">
          Nothing has to be wrong with you for this to feel exhausting. What usually happens in the days just
          before you drop one goal and pick up the next?
        </div>
        <div className="ml-auto w-fit max-w-[88%] rounded-lg bg-sunken px-4 py-2.5">
          I see someone doing well on LinkedIn and think, that should be me.
        </div>
        <div className="max-w-[94%] border-l-2 border-brand pl-4">
          So the trigger is someone else's success, not something you discovered about the work. What pulls you
          most: what they do every day, or where they have reached?
        </div>
      </div>
      <div className="border-t border-line px-5 py-3 text-xs text-muted">
        One question at a time. No lectures, no generic lists.
      </div>
    </Card>
  );
}

const FACTS = [
  {
    value: '4.33 crore',
    label: 'students enrolled in higher education in India',
    source: 'AISHE 2021-22, Ministry of Education',
    href: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1999713',
  },
  {
    value: '51.25%',
    label: 'of young Indians assessed were rated highly employable',
    source: 'India Skills Report 2024',
    href: 'https://wheebox.com/assets/pdf/ISR_Report_2024.pdf',
  },
  {
    value: '70 to 92%',
    label: 'treatment gap for mental health conditions in India',
    source: 'National Mental Health Survey 2015-16, NIMHANS',
    href: 'https://indianmhs.nimhans.ac.in/phase1/Docs/Summary.pdf',
  },
  {
    value: '2 sigma',
    label: 'gain from one-to-one tutoring over conventional classrooms',
    source: 'Bloom, Educational Researcher, 1984',
    href: 'https://doi.org/10.3102/0013189X013006004',
  },
];

const PRODUCTS = [
  {
    icon: MessageSquareText,
    label: 'Reflect',
    name: 'StudentGPT',
    body: 'A mentor that asks before it advises. It helps students identify what sits beneath their confusion, from expectations to fears and borrowed goals, and closes with a written clarity summary.',
    points: ['Focused questions that build on each answer', 'Safety screening on every message', 'A clarity summary the student keeps'],
    cta: 'Start a reflection',
    to: '/reflect',
  },
  {
    icon: BookOpen,
    label: 'Learn',
    name: 'Classroom',
    body: 'Turns a learning goal into a personalised programme. It assesses current knowledge, builds a roadmap, teaches each lesson at the right level and adapts as the student progresses.',
    points: ['Diagnostic assessment before any plan', 'Lessons, an AI teacher, quizzes and projects', 'Mastery tracking that reshapes the roadmap'],
    cta: 'Build a learning plan',
    to: '/learn',
  },
];

const STEPS = [
  { n: '01', title: 'Reflect', body: 'Talk through what is unclear. StudentGPT asks focused questions until the real issue is visible.' },
  { n: '02', title: 'Plan', body: 'Turn clarity into a goal. Classroom assesses your level and builds a roadmap around your time.' },
  { n: '03', title: 'Learn and prove it', body: 'Study lessons written for you, ask your AI teacher, and demonstrate mastery with practice and projects.' },
];

const PRINCIPLES = [
  {
    title: 'Ask before advising',
    body: 'People act on conclusions they reach themselves. StudentGPT uses guided questioning instead of instructions.',
    cite: 'Miller and Rollnick, Motivational Interviewing, 2013',
  },
  {
    title: 'Teach one student at a time',
    body: 'One-to-one instruction with mastery checks is among the most effective forms of teaching ever measured.',
    cite: 'Bloom, Educational Researcher, 1984',
  },
  {
    title: 'Practise by recalling',
    body: 'Retrieving knowledge through quizzes strengthens long-term retention more than re-reading.',
    cite: 'Roediger and Karpicke, Psychological Science, 2006',
  },
  {
    title: 'Explain in your own words',
    body: 'Learners who explain material to themselves understand it more deeply. Short answers are graded on reasoning.',
    cite: 'Chi et al., Cognitive Science, 1994',
  },
];

const TRUST = [
  {
    icon: ShieldCheck,
    title: 'Safety on every message',
    body: 'A deterministic screen in English and Hinglish runs before the model replies. Signs of crisis switch the conversation to a safety protocol with helplines.',
  },
  {
    icon: FileLock2,
    title: 'Your data stays yours',
    body: 'No advertising and no sale of data. Delete any conversation, classroom or your whole account at any time.',
  },
  {
    icon: GitBranch,
    title: 'Open and accountable',
    body: 'The full source code and the evaluation suite are public under the MIT License, so anyone can inspect how it works.',
  },
];

const FAQ = [
  ['Is MahaGuru AI free?', 'Yes. You can start without an account within a daily allowance. A free account raises the limit and keeps your history across devices.'],
  ['Is StudentGPT a therapist?', 'No. StudentGPT is a mentor for reflection. It does not diagnose or treat, and it directs students to professional help and national helplines when needed.'],
  ['What can Classroom teach?', 'Any goal you can describe, from programming and data analysis to design and interview preparation. It is not tied to a single syllabus.'],
  ['Which languages are supported?', 'Conversations work in English and Hinglish, and safety screening covers both.'],
  ['Who is it for?', 'College students and graduates aged 18 and above.'],
];

export default function HomePage() {
  const navigate = useNavigate();
  return (
    <PageShell>
      {/* Hero */}
      <section className="border-b border-line">
        <div className="container-page grid gap-12 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
          <div>
            <p className="eyebrow text-brand">AI mentorship and learning for students</p>
            <h1 className="mt-4 font-display text-[2.4rem] font-semibold leading-[1.1] tracking-tight sm:text-[3.25rem]">
              From confusion to clarity, for every college student.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              MahaGuru AI combines a reflective mentor and a personalised classroom. Understand what is holding you
              back, then build the skills to move forward.
            </p>
            <div className="mt-8 max-w-xl">
              <Composer />
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              {['Free to start', 'No sign-up required', 'English and Hinglish'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-brand" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <ConversationPreview />
        </div>
      </section>

      {/* Facts */}
      <section className="border-b border-line bg-sunken">
        <div className="container-page py-14">
          <p className="eyebrow text-brand">Why this matters</p>
          <dl className="mt-6 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {FACTS.map((f) => (
              <div key={f.value} className="flex flex-col bg-surface p-6">
                <dt className="order-2 mt-2 text-sm leading-relaxed text-ink">{f.label}</dt>
                <dd className="order-1 text-3xl font-semibold tracking-tight">{f.value}</dd>
                <a href={f.href} target="_blank" rel="noreferrer" className="order-3 mt-4 text-xs text-muted hover:text-brand">
                  Source: {f.source}
                </a>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Products */}
      <section className="container-page section">
        <div className="max-w-2xl">
          <p className="eyebrow text-brand">Products</p>
          <h2 className="section-title mt-3">Two products. One path forward.</h2>
          <p className="section-lead">
            Most students need both: clarity about direction, and a structured way to build the skills that direction
            demands. MahaGuru AI connects the two.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {PRODUCTS.map((p) => (
            <Card key={p.name} className="flex flex-col p-8">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand">
                  <p.icon className="h-5 w-5" aria-hidden />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{p.label}</span>
              </div>
              <h3 className="mt-6 text-2xl font-semibold tracking-tight">{p.name}</h3>
              <p className="mt-3 leading-relaxed text-muted">{p.body}</p>
              <ul className="mt-6 space-y-3 text-sm">
                {p.points.map((pt) => (
                  <li key={pt} className="flex gap-3">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                    {pt}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Button variant="outline" onClick={() => navigate(p.to)}>
                  {p.cta} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-line bg-sunken">
        <div className="container-page section">
          <div className="max-w-2xl">
            <p className="eyebrow text-brand">How it works</p>
            <h2 className="section-title mt-3">A clear process, from first question to finished project.</h2>
          </div>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="bg-surface p-8">
                <span className="text-sm font-semibold text-brand">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Research */}
      <section className="container-page section">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow text-brand">Research</p>
            <h2 className="section-title mt-3">Built on learning science, not guesswork.</h2>
            <p className="section-lead">
              Every part of the product follows a published finding about how people learn, decide and change.
            </p>
          </div>
          <Link to="/research" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            Read our research approach <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="border-t-2 border-ink pt-5">
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              <p className="mt-4 text-xs text-muted">{p.cite}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="border-y border-line bg-sunken">
        <div className="container-page section">
          <div className="max-w-2xl">
            <p className="eyebrow text-brand">Trust and safety</p>
            <h2 className="section-title mt-3">Designed for responsibility from day one.</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TRUST.map((t) => (
              <Card key={t.title} className="p-7">
                <t.icon className="h-5 w-5 text-brand" aria-hidden />
                <h3 className="mt-5 font-semibold">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>
              </Card>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted">
            Read more on{' '}
            <Link to="/safety" className="font-medium text-brand hover:underline">safety and support</Link> and{' '}
            <Link to="/privacy" className="font-medium text-brand hover:underline">privacy</Link>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="container-page section grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <div>
          <p className="eyebrow text-brand">Questions</p>
          <h2 className="section-title mt-3">Frequently asked questions</h2>
        </div>
        <div className="divide-y divide-line border-y border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="text-xl leading-none text-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Call to action */}
      <section className="container-page pb-24">
        <div className="flex flex-col gap-8 rounded-2xl bg-ink px-8 py-12 text-bg sm:px-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight">Start with one honest conversation.</h2>
            <p className="mt-3 leading-relaxed opacity-75">
              It takes a few minutes, it is free, and you do not need an account to begin.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={() => navigate('/reflect')}>
              Start a reflection
            </Button>
            <Button size="lg" variant="ghost" className="text-bg hover:bg-bg/10" onClick={() => navigate('/learn')}>
              Build a learning plan <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
