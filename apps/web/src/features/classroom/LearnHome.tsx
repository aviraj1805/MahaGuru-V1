import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, GraduationCap } from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Badge, Button, Card, EmptyState, ErrorState, ProgressBar, Skeleton, Textarea } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { ClassroomSummary } from '@/lib/types';
import { timeAgo } from '@/lib/utils';
import { CR_LIST } from './shared';

const EXAMPLES = [
  'Learn machine learning to build a portfolio project',
  'Prepare for software engineering internship interviews',
  'Learn UI/UX design from scratch',
  'Learn SQL and data analysis for business problems',
];

const STATUS: Record<ClassroomSummary['status'], { label: string; tone: 'neutral' | 'learn' | 'ok' | 'warn' }> = {
  intake: { label: 'Setting up', tone: 'warn' },
  diagnostic: { label: 'Assessment pending', tone: 'warn' },
  active: { label: 'In progress', tone: 'learn' },
  completed: { label: 'Completed', tone: 'ok' },
};

export function GoalForm({ compact }: { compact?: boolean }) {
  const [goal, setGoal] = useState('');
  const navigate = useNavigate();
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (goal.trim().length >= 5) navigate(`/learn/new?goal=${encodeURIComponent(goal.trim())}`);
  };
  return (
    <form onSubmit={submit}>
      <Card className="p-2 focus-within:border-learn/40">
        <Textarea
          rows={compact ? 1 : 2}
          autoGrow
          maxRows={5}
          value={goal}
          maxLength={600}
          onChange={(e) => setGoal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="What do you want to learn or build? Be as specific as you like."
          aria-label="Your learning goal"
          className="border-0 bg-transparent text-base focus:ring-0"
        />
        <div className="flex justify-end px-2 pb-1">
          <Button type="submit" variant="learn" disabled={goal.trim().length < 5}>
            Create my classroom <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
      {!compact && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => navigate(`/learn/new?goal=${encodeURIComponent(e)}`)}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-muted hover:border-learn/40 hover:text-ink"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

export function ClassroomCard({ c }: { c: ClassroomSummary }) {
  const s = STATUS[c.status];
  return (
    <Link to={`/learn/${c.id}`} className="group block">
      <Card className="h-full p-5 transition-shadow group-hover:shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-learn-soft text-learn">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
        <h3 className="mt-4 font-serif text-lg leading-snug">{c.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{c.goal_text}</p>
        {(c.status === 'active' || c.status === 'completed') && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-muted">
              <span>{c.percent}% complete</span>
              <span>{timeAgo(c.updated_at)}</span>
            </div>
            <ProgressBar value={c.percent} />
            {c.next_lesson_title && (
              <p className="mt-3 truncate text-sm">
                <span className="text-muted">Next: </span>
                {c.next_lesson_title}
              </p>
            )}
          </div>
        )}
      </Card>
    </Link>
  );
}

export default function LearnHome() {
  const { data: session } = useSession();
  const list = useQuery({
    queryKey: CR_LIST,
    queryFn: () => api<ClassroomSummary[]>('/api/classroom/classrooms'),
    enabled: !!session?.user,
  });
  return (
    <PageShell>
      <div className="container-page py-10 sm:py-14">
        <div className="max-w-2xl">
          <p className="eyebrow text-learn">Classroom</p>
          <h1 className="mt-2 font-serif text-4xl">What do you want to learn?</h1>
          <p className="mt-3 text-muted">
            Describe a goal. We'll ask a couple of questions, check what you already know, and build a roadmap made for
            you, with lessons, a teacher, practice and progress tracking.
          </p>
        </div>
        <div className="mt-8 max-w-3xl">
          <GoalForm />
        </div>

        <h2 className="mt-14 font-serif text-2xl">Your classrooms</h2>
        <div className="mt-5">
          {!session?.user ? (
            <Card>
              <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No classrooms yet">
                Your first classroom will appear here after you set a goal.
              </EmptyState>
            </Card>
          ) : list.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : list.data?.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.data.map((c) => (
                <ClassroomCard key={c.id} c={c} />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState icon={<BookOpen className="h-5 w-5" />} title="No classrooms yet">
                Your first classroom will appear here after you set a goal.
              </EmptyState>
            </Card>
          )}
        </div>
      </div>
    </PageShell>
  );
}
