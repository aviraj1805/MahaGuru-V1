import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Brain,
  Check,
  ClipboardCheck,
  Compass,
  FileLock2,
  GitBranch,
  Layers,
  MessageSquareText,
  PenLine,
  Repeat,
  ShieldCheck,
  Target,
  Users,
} from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { CountUp, Reveal, prefersReducedMotion, useInView } from '@/components/marketing/motion';
import { Button, Card, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ composer */

type Mode = 'reflect' | 'learn';

const MODES: Record<Mode, { label: string; placeholder: string; hint: string; starters: string[] }> = {
  reflect: {
    label: 'StudentGPT',
    placeholder: 'Describe what feels unclear, in your own words',
    hint: 'StudentGPT asks focused questions to help you find the real issue.',
    starters: ['I keep switching career goals', 'My parents want engineering, I prefer design', 'I feel behind everyone in my batch'],
  },
  learn: {
    label: 'Classroom',
    placeholder: 'What do you want to learn? For example: data analysis with Python',
    hint: 'Classroom assesses your level and builds a personalised roadmap.',
    starters: ['Prepare for software engineering interviews', 'Learn UI and UX design from scratch', 'Build and deploy a full-stack web app'],
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
      <div role="tablist" aria-label="Choose a product" className="mb-3 inline-flex rounded-lg border border-white/10 bg-white/5 p-1 backdrop-blur">
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
                active ? 'bg-white text-slate-900 shadow' : 'text-slate-300 hover:text-white',
              )}
            >
              {MODES[key].label}
            </button>
          );
        })}
      </div>
      <form onSubmit={onSubmit}>
        <Card className="border-white/10 p-2 shadow-2xl shadow-blue-950/40">
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
            <Button type="submit" size="icon" disabled={!text.trim()} aria-label={mode === 'reflect' ? 'Start reflecting' : 'Start learning'} className="h-9 w-9 shrink-0">
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
            className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-white/30 hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ live demo */

type Line = { role: 'user' | 'ai'; text: string };

const SCENARIOS: { key: string; label: string; summary: string; script: Line[] }[] = [
  {
    key: 'career',
    label: 'Career confusion',
    summary: 'Comparison, not the work itself, drives the switching.',
    script: [
      { role: 'user', text: 'I keep switching between data science, product and UPSC. What is wrong with me?' },
      { role: 'ai', text: 'Nothing has to be wrong with you for this to feel exhausting. What usually happens just before you drop one goal and pick up the next?' },
      { role: 'user', text: 'I see someone doing well on LinkedIn and think, that should be me.' },
      { role: 'ai', text: "So the trigger is someone else's success, not something you discovered about the work. What pulls you most: what they do every day, or where they have reached?" },
    ],
  },
  {
    key: 'family',
    label: 'Family pressure',
    summary: 'The worry is about their sacrifice, not about design.',
    script: [
      { role: 'user', text: 'My parents want engineering. I want design.' },
      { role: 'ai', text: 'That sounds like two strong pulls at once. When you imagine telling them, which part feels hardest?' },
      { role: 'user', text: 'That they will think I am wasting their money.' },
      { role: 'ai', text: 'So the weight is their sacrifice, not design itself. What would make design feel like a responsible choice to you?' },
    ],
  },
  {
    key: 'motivation',
    label: 'Lost motivation',
    summary: 'Building with people is what used to energise you.',
    script: [
      { role: 'user', text: 'Kuch bhi padhne ka mann nahi karta. I have zero motivation for my course.' },
      { role: 'ai', text: 'That can feel really heavy. When did studying last feel different, even a little?' },
      { role: 'user', text: 'First year, when we built projects as a team.' },
      { role: 'ai', text: 'So building with people energised you. What is missing from how you study now?' },
    ],
  },
];

/** Plays the scripted conversation: student messages appear, mentor replies type out, then it loops. */
function useScript(SCRIPT: Line[]) {
  const [step, setStep] = useState(0);
  const [chars, setChars] = useState(0);
  const [thinking, setThinking] = useState(false);
  const reduced = prefersReducedMotion();

  useEffect(() => {
    if (reduced) return;
    let t: ReturnType<typeof setTimeout>;
    if (step >= SCRIPT.length) {
      t = setTimeout(() => {
        setStep(0);
        setChars(0);
      }, 5000);
    } else if (SCRIPT[step].role === 'user') {
      t = setTimeout(() => {
        setStep((s) => s + 1);
        setThinking(true);
      }, 1100);
    } else if (thinking) {
      t = setTimeout(() => setThinking(false), 900);
    } else if (chars < SCRIPT[step].text.length) {
      t = setTimeout(() => setChars((c) => c + 2), 22);
    } else {
      t = setTimeout(() => {
        setStep((s) => s + 1);
        setChars(0);
      }, 1800);
    }
    return () => {
      clearTimeout(t);
    };
  }, [SCRIPT, step, chars, thinking, reduced]);

  if (reduced) return { visible: SCRIPT.map((m) => ({ ...m, typing: false })), thinking: false };
  const visible = SCRIPT.slice(0, Math.min(step + 1, SCRIPT.length)).map((m, i) =>
    i === step && m.role === 'ai' ? { ...m, text: m.text.slice(0, chars), typing: true } : { ...m, typing: false },
  );
  return { visible: thinking ? visible.slice(0, -1) : visible, thinking };
}

function Conversation({ script }: { script: Line[] }) {
  const { visible, thinking } = useScript(script);
  return (
    <div className="flex h-[21rem] flex-col justify-end gap-4 overflow-hidden p-5 text-[14.5px] leading-relaxed" aria-label="Example StudentGPT conversation">
      {visible.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="ml-auto w-fit max-w-[86%] animate-fade-up rounded-xl rounded-br-sm bg-white/10 px-4 py-2.5 text-white">
            {m.text}
          </div>
        ) : (
          <div key={i} className="max-w-[94%] border-l-2 border-sky-400 pl-4 text-slate-200">
            {m.text}
            {m.typing && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-caret bg-sky-300" />}
          </div>
        ),
      )}
      {thinking && (
        <div className="flex gap-1 pl-4" aria-hidden>
          {[0, 1, 2].map((d) => (
            <span key={d} className="h-1.5 w-1.5 animate-pulse3 rounded-full bg-sky-300" style={{ animationDelay: `${d * 0.15}s` }} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveDemo() {
  const [active, setActive] = useState(0);
  const scenario = SCENARIOS[active];
  return (
    <div className="relative lg:my-12">
      <div className="mb-3 flex flex-wrap gap-2" aria-label="Example scenarios">
        {SCENARIOS.map((sc, i) => (
          <button
            key={sc.key}
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition',
              i === active ? 'border-sky-400/60 bg-sky-400/15 text-white' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white',
            )}
          >
            {sc.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-blue-950/50 backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
          </div>
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            StudentGPT
          </span>
        </div>
        <Conversation key={scenario.key} script={scenario.script} />
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3.5">
          <span className="text-sm text-slate-500">Write freely.</span>
          <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-600/80 text-white">
            <ArrowUp className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>

      <div key={scenario.key} className="absolute -bottom-10 -left-12 hidden w-56 animate-float rounded-xl border border-white/10 bg-slate-900/90 p-4 shadow-xl backdrop-blur lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Clarity summary</p>
        <p className="mt-1.5 text-sm text-white">{scenario.summary}</p>
        <div className="mt-3 flex gap-1">
          {[1, 1, 1, 0.4].map((o, i) => (
            <span key={i} className="h-1 flex-1 rounded-full bg-sky-400" style={{ opacity: o }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-[#060A18] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] animate-drift rounded-full bg-blue-600/35 blur-3xl" />
        <div className="absolute -right-32 top-10 h-[30rem] w-[30rem] animate-drift-slow rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute bottom-[-12rem] left-1/3 h-[28rem] w-[28rem] animate-drift rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      </div>
      <div className="container-page grid gap-14 pb-24 pt-16 sm:pt-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
            Built for students across India
          </p>
          <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.06] tracking-tight sm:text-[3.6rem]">
            From confusion to <span className="text-gradient">clarity</span>, for every college student.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            Find your direction. Build the skills. One place.
          </p>
          <div className="mt-9 max-w-xl">
            <Composer />
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
            {['Free to start', 'No sign-up required', 'English and Hinglish'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-sky-400" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <LiveDemo />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ marquee */

const TOPICS_A = ['Choosing a career direction', 'Placement anxiety', 'Python for data analysis', 'Switching streams', 'SQL from scratch', 'Procrastination', 'Product management', 'Comparing myself to peers'];
const TOPICS_B = ['UI and UX design', 'Interview preparation', 'Family expectations', 'Machine learning basics', 'Higher studies or a job', 'Building a portfolio', 'Losing motivation', 'Full-stack development'];

function MarqueeRow({ items, reverse }: { items: string[]; reverse?: boolean }) {
  return (
    <div className="flex w-max animate-marquee gap-3" style={reverse ? { animationDirection: 'reverse' } : undefined}>
      {[...items, ...items].map((t, i) => (
        <span key={i} className="flex items-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface px-4 py-2 text-sm text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" />
          {t}
        </span>
      ))}
    </div>
  );
}

function TopicMarquee() {
  return (
    <section className="border-b border-line py-10">
      <p className="container-page text-center text-sm font-medium text-muted">What students bring to MahaGuru</p>
      <div className="relative mt-6 space-y-3 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <MarqueeRow items={TOPICS_A} />
        <MarqueeRow items={TOPICS_B} reverse />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ facts */

const FACTS = [
  { prefix: '', value: 4.33, decimals: 2, suffix: ' crore', label: 'students in Indian higher education', source: 'AISHE 2021-22, Ministry of Education', href: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=1999713' },
  { prefix: '', value: 51.25, decimals: 2, suffix: '%', label: 'of young Indians rated highly employable', source: 'India Skills Report 2024', href: 'https://wheebox.com/assets/pdf/ISR_Report_2024.pdf' },
  { prefix: '70 to ', value: 92, decimals: 0, suffix: '%', label: 'mental health treatment gap', source: 'National Mental Health Survey 2015-16, NIMHANS', href: 'https://indianmhs.nimhans.ac.in/phase1/Docs/Summary.pdf' },
  { prefix: '', value: 2, decimals: 0, suffix: ' sigma', label: 'gain from one-to-one tutoring', source: 'Bloom, Educational Researcher, 1984', href: 'https://doi.org/10.3102/0013189X013006004' },
];

function Facts() {
  return (
    <section className="container-page section">
      <Reveal className="max-w-2xl">
        <p className="eyebrow text-brand">Why this matters</p>
        <h2 className="section-title mt-3">The challenge, in numbers.</h2>
      </Reveal>
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.map((f, i) => (
          <Reveal key={f.label} delay={i * 90}>
            <div className="group relative h-full overflow-hidden rounded-xl border border-line bg-surface p-6 transition hover:-translate-y-1 hover:shadow-lift">
              <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500" />
              <p className="text-gradient-strong text-4xl font-semibold tracking-tight">
                {f.prefix}
                <CountUp value={f.value} decimals={f.decimals} />
                {f.suffix}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink">{f.label}</p>
              <a href={f.href} target="_blank" rel="noreferrer" className="mt-5 block text-xs text-muted hover:text-brand">
                Source: {f.source}
              </a>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ products */

function ReflectVisual() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const stages = ['Opening', 'Exploring', 'Root cause', 'Clarity'];
  return (
    <div ref={ref} className="relative flex h-full min-h-[22rem] items-center overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-6 sm:p-12">
      <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative w-full rounded-xl bg-white/95 p-6 text-slate-900 shadow-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Understanding record</p>
        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {stages.map((s, i) => (
            <div key={s}>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-blue-600 transition-all duration-700 ease-out" style={{ width: inView && i < 3 ? '100%' : '0%', transitionDelay: `${i * 350}ms` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500">{s}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Noticed so far</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['Fear of disappointing parents', 'Comparison triggers', 'Enjoys design work'].map((t, i) => (
            <span
              key={t}
              className={cn('rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-800 transition-all duration-500', inView ? 'opacity-100' : 'opacity-0')}
              style={{ transitionDelay: `${900 + i * 250}ms` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function LearnVisual() {
  const { ref, inView } = useInView<HTMLDivElement>();
  const modules = [
    ['SQL foundations', 100],
    ['Data cleaning with pandas', 64],
    ['Portfolio project', 12],
  ] as const;
  return (
    <div ref={ref} className="relative flex h-full min-h-[22rem] items-center overflow-hidden bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-700 p-6 sm:p-12">
      <div className="bg-grid absolute inset-0 opacity-40" aria-hidden />
      <div className="relative w-full rounded-xl bg-white/95 p-6 text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Your roadmap</p>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Quiz score 86%</span>
        </div>
        <div className="mt-4 space-y-3.5">
          {modules.map(([name, pct], i) => (
            <div key={name}>
              <div className="flex justify-between text-xs">
                <span className="font-medium">{name}</span>
                <span className="text-slate-500">{pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-1000 ease-out" style={{ width: inView ? `${pct}%` : '0%', transitionDelay: `${i * 250}ms` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const PRODUCTS = [
  {
    key: 'reflect',
    visual: ReflectVisual,
    icon: MessageSquareText,
    name: 'StudentGPT',
    tag: 'Find your direction',
    points: ['Asks, never lectures', 'Safety on every message', 'Ends with a clarity summary'],
    cta: 'Start a reflection',
    to: '/reflect',
  },
  {
    key: 'learn',
    visual: LearnVisual,
    icon: BookOpen,
    name: 'Classroom',
    tag: 'Build the skills',
    points: ['Starts with a diagnostic', 'Lessons, AI teacher, quizzes', 'Roadmap adapts as you go'],
    cta: 'Build a learning plan',
    to: '/learn',
  },
];

function Products() {
  const navigate = useNavigate();
  const [active, setActive] = useState(0);
  const p = PRODUCTS[active];
  return (
    <section className="border-y border-line bg-sunken">
      <div className="container-page section">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-brand">Products</p>
          <h2 className="section-title mt-3">Two products. One path.</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.5fr] lg:items-stretch">
          <div className="flex flex-col gap-4">
            {PRODUCTS.map((item, i) => (
              <button
                key={item.key}
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                className={cn(
                  'group relative overflow-hidden rounded-xl border p-6 text-left transition',
                  i === active ? 'border-brand bg-surface shadow-lift' : 'border-line bg-surface/60 hover:border-ink/20 hover:bg-surface',
                )}
              >
                <span
                  className={cn('absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-600 to-cyan-500 transition-opacity', i === active ? 'opacity-100' : 'opacity-0')}
                  aria-hidden
                />
                <div className="flex items-center gap-3">
                  <div className={cn('grid h-10 w-10 place-items-center rounded-lg transition', i === active ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white' : 'bg-brand-soft text-brand')}>
                    <item.icon className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{item.name}</p>
                    <p className="text-sm text-muted">{item.tag}</p>
                  </div>
                </div>
                {i === active && (
                  <ul className="mt-5 space-y-2.5 text-sm">
                    {item.points.map((pt) => (
                      <li key={pt} className="flex animate-fade-up gap-2.5">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                        {pt}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            ))}
            <Button className="mt-auto self-start" size="lg" onClick={() => navigate(p.to)}>
              {p.cta} <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div key={p.key} className="animate-fade-up overflow-hidden rounded-2xl border border-line shadow-lift">
            <p.visual />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ process */

const STEPS = [
  { icon: Compass, title: 'Reflect', body: 'Find the real question.' },
  { icon: Target, title: 'Plan', body: 'Get a roadmap for your level.' },
  { icon: Layers, title: 'Learn', body: 'Lessons, practice and projects.' },
];

function Process() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <section className="container-page section">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="eyebrow text-brand">How it works</p>
        <h2 className="section-title mt-3">Three steps. Real progress.</h2>
      </Reveal>
      <div ref={ref} className="relative mt-16 grid gap-10 md:grid-cols-3">
        <div aria-hidden className="absolute left-[16.6%] right-[16.6%] top-7 hidden h-0.5 bg-line md:block">
          <div className="h-full origin-left bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 transition-transform duration-[1600ms] ease-out" style={{ transform: inView ? 'scaleX(1)' : 'scaleX(0)' }} />
        </div>
        {STEPS.map((s, i) => (
          <Reveal key={s.title} delay={i * 200} className="relative text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25">
              <s.icon className="h-6 w-6" aria-hidden />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Step {i + 1}</p>
            <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
            <p className="mx-auto mt-2 max-w-xs leading-relaxed text-muted">{s.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ research */

const PRINCIPLES = [
  { icon: Users, title: 'Ask before advising', cite: 'Miller and Rollnick, 2013' },
  { icon: Brain, title: 'One-to-one teaching', cite: 'Bloom, 1984' },
  { icon: Repeat, title: 'Practise by recalling', cite: 'Roediger and Karpicke, 2006' },
  { icon: PenLine, title: 'Explain in your words', cite: 'Chi et al., 1994' },
];

function Research() {
  return (
    <section className="border-y border-line bg-sunken">
      <div className="container-page section">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <Reveal className="max-w-2xl">
            <p className="eyebrow text-brand">Research</p>
            <h2 className="section-title mt-3">Built on learning science.</h2>
          </Reveal>
          <Link to="/research" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
            See the research <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <div className="h-full rounded-xl border border-line bg-surface p-6 transition hover:-translate-y-1 hover:shadow-lift">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand-soft text-brand">
                  <p.icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-5 font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-xs text-muted">{p.cite}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ trust */

const TRUST = [
  { icon: ShieldCheck, title: 'Safety on every message', body: 'English and Hinglish crisis screening.' },
  { icon: FileLock2, title: 'Your data stays yours', body: 'No ads. Delete anything, anytime.' },
  { icon: GitBranch, title: 'Open source', body: 'Every line public, MIT licensed.' },
  { icon: ClipboardCheck, title: 'Measured', body: '24 scenarios tested, crisis cases included.' },
];

function Trust() {
  return (
    <section className="relative isolate overflow-hidden bg-[#060A18] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute right-[-10rem] top-[-10rem] h-[30rem] w-[30rem] animate-drift-slow rounded-full bg-indigo-600/25 blur-3xl" />
        <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_10%,transparent_65%)]" />
      </div>
      <div className="container-page section">
        <Reveal className="max-w-2xl">
          <p className="eyebrow text-sky-400">Trust and safety</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Responsible by design.</h2>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t, i) => (
            <Reveal key={t.title} delay={i * 90}>
              <div className="h-full rounded-xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur transition hover:border-white/20 hover:bg-white/[0.07]">
                <t.icon className="h-5 w-5 text-sky-400" aria-hidden />
                <h3 className="mt-5 font-semibold">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{t.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-10 flex gap-6 text-sm">
          <Link to="/safety" className="font-medium text-sky-400 hover:underline">Safety</Link>
          <Link to="/privacy" className="font-medium text-sky-400 hover:underline">Privacy</Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ faq + cta */

const FAQ = [
  ['Is MahaGuru AI free?', 'Yes. Start without an account; a free account raises the daily limit.'],
  ['Is StudentGPT a therapist?', 'No. It is a reflection mentor and points to helplines when needed.'],
  ['What can Classroom teach?', 'Any goal you can describe: coding, data, design, interviews and more.'],
  ['Which languages are supported?', 'English and Hinglish.'],
  ['Who is it for?', 'College students and graduates, 18 and above.'],
];

function Faq() {
  return (
    <section className="container-page section grid gap-12 lg:grid-cols-[1fr_1.6fr]">
      <Reveal>
        <p className="eyebrow text-brand">FAQ</p>
        <h2 className="section-title mt-3">Questions</h2>
      </Reveal>
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
  );
}

function FinalCta() {
  const navigate = useNavigate();
  return (
    <section className="container-page pb-24">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-700 to-cyan-700 px-8 py-14 text-white sm:px-14">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -right-20 -top-24 h-80 w-80 animate-drift rounded-full bg-cyan-300/30 blur-3xl" />
            <div className="bg-grid absolute inset-0 opacity-50" />
          </div>
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your next step starts here.</h2>
              <p className="mt-3 text-blue-100">Free. No sign-up needed.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" className="bg-white text-slate-900 hover:bg-blue-50" onClick={() => navigate('/reflect')}>
                Start a reflection
              </Button>
              <Button size="lg" variant="ghost" className="text-white hover:bg-white/10" onClick={() => navigate('/learn')}>
                Build a learning plan <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export default function HomePage() {
  return (
    <PageShell>
      <Hero />
      <TopicMarquee />
      <Facts />
      <Products />
      <Process />
      <Research />
      <Trust />
      <Faq />
      <FinalCta />
    </PageShell>
  );
}
