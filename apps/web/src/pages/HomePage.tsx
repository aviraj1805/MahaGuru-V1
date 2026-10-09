import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Compass,
  Layers,
  LineChart,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Button, Card, Textarea } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

type Mode = 'reflect' | 'learn';

const MODES: Record<
  Mode,
  { label: string; icon: typeof Sparkles; placeholder: string; hint: string; starters: string[] }
> = {
  reflect: {
    label: 'StudentGPT',
    icon: Sparkles,
    placeholder: "What's on your mind? Describe what feels confusing, in your own words…",
    hint: 'Reflect: StudentGPT asks questions that help you understand yourself.',
    starters: [
      'I keep switching career goals every few weeks',
      'My parents want engineering, I love design',
      'I procrastinate on everything until the last night',
      "I feel behind everyone in my batch",
    ],
  },
  learn: {
    label: 'Classroom',
    icon: BookOpen,
    placeholder: 'What do you want to learn or build? e.g. "Learn machine learning for an internship"',
    hint: 'Learn: Classroom builds a personalised roadmap and teaches you step by step.',
    starters: [
      'Learn machine learning to build a portfolio project',
      'Prepare for software engineering internship interviews',
      'Learn UI/UX design from scratch',
      'Build and deploy my first full-stack web app',
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
    <div className="mx-auto w-full max-w-2xl">
      <div role="tablist" aria-label="Choose a mode" className="mx-auto mb-3 flex w-fit rounded-full border border-line bg-surface p-1 shadow-soft">
        {(Object.keys(MODES) as Mode[]).map((key) => {
          const Icon = MODES[key].icon;
          const active = key === mode;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={active}
              onClick={() => setMode(key)}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all',
                active
                  ? key === 'reflect'
                    ? 'bg-reflect text-white shadow-sm'
                    : 'bg-learn text-white shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {MODES[key].label}
            </button>
          );
        })}
      </div>
      <form onSubmit={onSubmit}>
        <Card
          className={cn(
            'p-2 transition-shadow focus-within:shadow-lift',
            mode === 'reflect' ? 'focus-within:border-reflect/40' : 'focus-within:border-learn/40',
          )}
        >
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
              variant={mode}
              disabled={!text.trim()}
              aria-label={mode === 'reflect' ? 'Start reflecting' : 'Start learning'}
              className="h-10 w-10 shrink-0 rounded-full"
            >
              <ArrowUp className="h-5 w-5" />
            </Button>
          </div>
        </Card>
      </form>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {m.starters.map((s) => (
          <button
            key={s}
            onClick={() => go(s)}
            className={cn(
              'rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted transition-colors hover:text-ink',
              mode === 'reflect' ? 'hover:border-reflect/40' : 'hover:border-learn/40',
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Product({
  tone,
  icon: Icon,
  name,
  tagline,
  body,
  points,
  cta,
  to,
}: {
  tone: 'reflect' | 'learn';
  icon: typeof Sparkles;
  name: string;
  tagline: string;
  body: string;
  points: string[];
  cta: string;
  to: string;
}) {
  const navigate = useNavigate();
  return (
    <Card className="flex flex-col p-7">
      <div className={cn('grid h-11 w-11 place-items-center rounded-xl', tone === 'reflect' ? 'bg-reflect-soft text-reflect' : 'bg-learn-soft text-learn')}>
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <p className={cn('mt-5 text-sm font-semibold', tone === 'reflect' ? 'text-reflect' : 'text-learn')}>{tagline}</p>
      <h3 className="mt-1 font-serif text-2xl">{name}</h3>
      <p className="mt-3 leading-relaxed text-muted">{body}</p>
      <ul className="mt-5 space-y-2.5 text-sm">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5">
            <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', tone === 'reflect' ? 'bg-reflect' : 'bg-learn')} />
            {p}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-7">
        <Button variant={tone} onClick={() => navigate(to)}>
          {cta} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}

const STEPS = [
  { icon: Target, title: 'Define your goal', body: 'Say what you want to learn or build, in plain words.' },
  { icon: Compass, title: 'Quick assessment', body: 'A few questions show what you already know, so nothing is wasted.' },
  { icon: Layers, title: 'Your roadmap', body: 'Modules, lessons and milestones built around your level and time.' },
  { icon: MessageCircleQuestion, title: 'Learn with a teacher', body: 'Lessons written for you, and an AI teacher for every doubt.' },
  { icon: LineChart, title: 'Practise and adapt', body: 'Quizzes and projects track mastery and reshape what comes next.' },
];

export default function HomePage() {
  return (
    <PageShell>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-12rem] h-[34rem] w-[52rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-reflect/15 via-brand/10 to-learn/15 blur-3xl" />
        </div>
        <div className="container-page pb-20 pt-16 text-center sm:pt-24">
          <p className="eyebrow">For college students who feel stuck</p>
          <h1 className="mx-auto mt-4 max-w-3xl font-serif text-[2.6rem] font-medium leading-[1.08] tracking-tight sm:text-6xl">
            नमस्ते. Let's turn confusion into <em className="not-italic text-brand">clarity</em>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Think through what's really bothering you with StudentGPT, or learn anything step by step in a
            Classroom built around you.
          </p>
          <div className="mt-10">
            <Composer />
          </div>
          <p className="mt-6 text-xs text-muted">Free to try. No sign-up needed to start.</p>
        </div>
      </section>

      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">Two ways MahaGuru helps</p>
          <h2 className="mt-3 font-serif text-3xl sm:text-4xl">Understand yourself. Then build your path.</h2>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <Product
            tone="reflect"
            icon={Sparkles}
            name="StudentGPT"
            tagline="Reflect"
            body="A mentor that asks before it answers. It helps you find the root of your confusion: the fears, expectations and beliefs underneath it."
            points={[
              'Thoughtful questions that build on what you say',
              'No lectures or premature advice',
              'A clarity summary you can keep',
            ]}
            cta="Start reflecting"
            to="/reflect"
          />
          <Product
            tone="learn"
            icon={BookOpen}
            name="Classroom"
            tagline="Learn and execute"
            body="Turn a goal into a personalised roadmap, learn with lessons written for your level, and prove it with practice and projects."
            points={[
              'Starts from what you already know',
              'Lessons, an AI teacher, quizzes and projects',
              'Tracks your progress and adapts the plan',
            ]}
            cta="Start learning"
            to="/learn"
          />
        </div>
      </section>

      <section className="border-y border-line bg-surface/60">
        <div className="container-page py-16">
          <div className="max-w-2xl">
            <p className="eyebrow">How Classroom works</p>
            <h2 className="mt-3 font-serif text-3xl">A classroom designed around one student: you.</h2>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between">
                  <s.icon className="h-5 w-5 text-learn" aria-hidden />
                  <span className="font-serif text-sm text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-4 font-medium">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-page grid gap-10 py-16 md:grid-cols-2 md:items-center">
        <div>
          <p className="eyebrow">How StudentGPT thinks</p>
          <h2 className="mt-3 font-serif text-3xl">Clarity you reach yourself lasts.</h2>
          <p className="mt-4 leading-relaxed text-muted">
            Say "I'm confused about my career" and StudentGPT won't hand you a list of jobs. It will ask why it
            feels confusing now, explore the reason you give, and gently look at the assumptions underneath,
            until you can see the real question.
          </p>
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-reflect-soft p-4 text-sm text-ink">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-reflect" aria-hidden />
            <p>
              StudentGPT is a mentor, not a therapist. If a conversation shows signs of serious distress, it pauses
              and points you to people who can help right away.
            </p>
          </div>
        </div>
        <Card className="space-y-4 p-6 text-[15px]">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sunken px-4 py-2.5">
            I keep switching between data science, product and UPSC. What's wrong with me?
          </div>
          <div className="max-w-[92%] leading-relaxed">
            Nothing has to be wrong with you for this to feel exhausting. I'm curious about the switching itself:
            what usually happens in the days just before you drop one goal and pick up the next?
          </div>
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-sunken px-4 py-2.5">
            I see someone doing well on LinkedIn and think, that should be me.
          </div>
          <div className="max-w-[92%] leading-relaxed">
            So the trigger is someone else's success, not something you discovered about the work. What pulls you
            most: what they do every day, or where they've reached?
          </div>
        </Card>
      </section>
    </PageShell>
  );
}
