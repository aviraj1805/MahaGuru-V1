import { useNavigate } from 'react-router-dom';
import { BookOpen, Compass, HeartHandshake, Lightbulb, Phone } from 'lucide-react';
import { Button, Card } from '@/components/ui/primitives';
import type { Clarity, Explored, Helpline, Stage } from '@/lib/types';
import { cn } from '@/lib/utils';

export const STAGE_LABEL: Record<Stage, string> = {
  opening: 'Getting started',
  exploring: 'Exploring',
  deepening: 'Going deeper',
  reflecting: 'Reflecting',
  clarity: 'Clarity',
};
const STAGES: Stage[] = ['opening', 'exploring', 'deepening', 'reflecting', 'clarity'];

export function StageMeter({ stage }: { stage: Stage }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div aria-label={`Stage: ${STAGE_LABEL[stage]}`}>
      <div className="flex gap-1">
        {STAGES.map((s, i) => (
          <span key={s} className={cn('h-1.5 flex-1 rounded-full', i <= idx ? 'bg-reflect' : 'bg-sunken')} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted">{STAGE_LABEL[stage]}</p>
    </div>
  );
}

export function SafetyCard({ helplines, level }: { helplines: Helpline[]; level: 'elevated' | 'crisis' }) {
  return (
    <div
      role="alert"
      className={cn(
        'rounded-2xl border p-4 text-sm animate-fade-up',
        level === 'crisis' ? 'border-danger/30 bg-danger-soft' : 'border-warn/30 bg-warn-soft',
      )}
    >
      <div className="flex items-start gap-3">
        <HeartHandshake className={cn('mt-0.5 h-5 w-5 shrink-0', level === 'crisis' ? 'text-danger' : 'text-warn')} aria-hidden />
        <div className="min-w-0">
          <p className="font-medium text-ink">
            {level === 'crisis'
              ? "You don't have to go through this alone. Please reach out to someone now."
              : 'If things feel heavy, talking to a person can really help.'}
          </p>
          <ul className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
            {helplines.map((h) => (
              <li key={h.name}>
                <a href={h.href} className="flex items-start gap-2 rounded-lg bg-surface/70 px-3 py-2 hover:bg-surface">
                  <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                  <span>
                    <span className="block font-medium text-ink">{h.contact}</span>
                    <span className="text-xs text-muted">{h.name}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function ExploredPanel({ explored }: { explored: Explored }) {
  const empty = !explored.presenting_concern && !explored.insights.length && !explored.open_threads.length;
  return (
    <div className="space-y-6">
      <StageMeter stage={explored.stage} />
      {empty ? (
        <p className="text-sm text-muted">As you talk, StudentGPT notes what you're exploring. It will show up here.</p>
      ) : (
        <>
          {explored.presenting_concern && (
            <section>
              <h3 className="eyebrow">What you came with</h3>
              <p className="mt-2 text-sm leading-relaxed">{explored.presenting_concern}</p>
            </section>
          )}
          {!!explored.insights.length && (
            <section>
              <h3 className="eyebrow">What you've noticed</h3>
              <ul className="mt-2 space-y-2 text-sm">
                {explored.insights.map((i) => (
                  <li key={i} className="flex gap-2">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-reflect" aria-hidden /> {i}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!!explored.open_threads.length && (
            <section>
              <h3 className="eyebrow">Threads to explore</h3>
              <ul className="mt-2 space-y-2 text-sm text-muted">
                {explored.open_threads.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Compass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map((i) => (
          <li key={i} className="flex gap-2.5 leading-relaxed">
            <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-reflect" />
            {i}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ClarityCardView({ clarity }: { clarity: Clarity }) {
  const navigate = useNavigate();
  return (
    <Card className="overflow-hidden border-reflect/30 animate-fade-up" aria-label="Clarity summary">
      <div className="bg-reflect-soft px-6 py-4">
        <p className="eyebrow text-reflect-ink">Your clarity summary</p>
      </div>
      <div className="space-y-5 p-6 text-[15px]">
        <section>
          <h3 className="eyebrow">You came in with</h3>
          <p className="mt-2 leading-relaxed">{clarity.came_with}</p>
        </section>
        <section>
          <h3 className="eyebrow">What seems to sit underneath</h3>
          <p className="mt-2 font-display font-semibold tracking-tight text-lg leading-relaxed">{clarity.underneath}</p>
        </section>
        <Section title="What you realised" items={clarity.insights} />
        <Section title="Assumptions worth testing" items={clarity.assumptions_to_question} />
        <Section title="Questions to sit with" items={clarity.questions_to_sit_with} />
        {clarity.next_step && (
          <section className="rounded-xl bg-sunken p-4">
            <h3 className="eyebrow">A small next step you seemed ready for</h3>
            <p className="mt-1.5">{clarity.next_step}</p>
          </section>
        )}
        {clarity.learning_goal && (
          <div className="flex flex-col gap-3 rounded-xl border border-learn/30 bg-learn-soft p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <span className="font-medium">Ready to act on it?</span> Turn "{clarity.learning_goal}" into a personalised
              Classroom.
            </p>
            <Button
              variant="learn"
              size="sm"
              onClick={() => navigate(`/learn/new?goal=${encodeURIComponent(clarity.learning_goal!)}`)}
            >
              <BookOpen className="h-4 w-4" /> Start Classroom
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export const REFLECT_STARTERS = [
  'I keep switching career goals and feel lost',
  'My parents want one thing for me and I want another',
  'I have zero motivation for my course anymore',
  'I compare myself to everyone and feel behind',
];
