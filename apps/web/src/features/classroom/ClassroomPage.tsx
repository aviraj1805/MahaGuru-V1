import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronDown,
  Clock,
  Flag,
  Hammer,
  RefreshCw,
  MessageSquareText,
  Target,
  Trash2,
  Trophy,
} from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Markdown } from '@/components/ui/Markdown';
import { Alert, Badge, Button, Card, Dialog, ErrorState, Input, ProgressBar, Spinner, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useRefreshSession } from '@/lib/session';
import type { AssignmentT, ClassroomT, ModuleT, SubmitResult } from '@/lib/types';
import { cn, minutesLabel } from '@/lib/utils';
import { AssessmentView, CR_LIST, crKey, LessonStatusIcon, STATUS_LABEL } from './shared';

function BusyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-10 text-center">
      <Spinner className="justify-center" />
      <h2 className="mt-4 font-display font-semibold tracking-tight text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
    </Card>
  );
}

// ---------------------------------------------------------------- intake
function IntakeView({ room, onUpdate }: { room: ClassroomT; onUpdate: (r: ClassroomT) => void }) {
  const questions = room.intake.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>(room.intake.answers ?? {});
  const [other, setOther] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<null | 'diagnostic' | 'skip'>(null);
  const [error, setError] = useState<string | null>(null);
  const refreshSession = useRefreshSession();

  const submit = async (skip: boolean) => {
    setBusy(skip ? 'skip' : 'diagnostic');
    setError(null);
    try {
      const r = await api<ClassroomT>(`/api/classroom/classrooms/${room.id}/intake`, {
        body: { answers, skip_diagnostic: skip },
      });
      onUpdate(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
      refreshSession();
    }
  };

  if (busy === 'diagnostic')
    return <BusyCard title="Preparing a short assessment…" body="A few questions to see what you already know, so your roadmap skips what you've mastered." />;
  if (busy === 'skip')
    return <BusyCard title="Building your roadmap…" body="Designing modules, lessons and milestones around your goal. This can take up to a minute." />;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <p className="eyebrow">Your goal</p>
        <p className="mt-2 font-display font-semibold tracking-tight text-xl leading-snug">{room.intake.goal_restated || room.goal_text}</p>
      </Card>
      <div>
        <h2 className="font-display font-semibold tracking-tight text-2xl">A few quick questions</h2>
        <p className="mt-1 text-sm text-muted">They help us fit the plan to you. Skip any you're unsure about.</p>
      </div>
      {questions.map((q) => (
        <Card key={q.id} className="p-5">
          <p className="font-medium">{q.question}</p>
          {q.options.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={q.question}>
              {q.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={answers[q.id] === o && !other[q.id]}
                  onClick={() => {
                    setOther((x) => ({ ...x, [q.id]: false }));
                    setAnswers((a) => ({ ...a, [q.id]: o }));
                  }}
                  className={cn(
                    'rounded-md border px-3.5 py-1.5 text-sm transition-colors',
                    answers[q.id] === o && !other[q.id]
                      ? 'border-learn bg-learn text-white'
                      : 'border-line bg-surface hover:border-learn/50',
                  )}
                >
                  {o}
                </button>
              ))}
              {q.allow_free_text && (
                <button
                  type="button"
                  onClick={() => {
                    setOther((x) => ({ ...x, [q.id]: true }));
                    setAnswers((a) => ({ ...a, [q.id]: '' }));
                  }}
                  className={cn(
                    'rounded-md border border-dashed px-3.5 py-1.5 text-sm',
                    other[q.id] ? 'border-learn text-learn' : 'border-line text-muted hover:text-ink',
                  )}
                >
                  Something else
                </button>
              )}
            </div>
          )}
          {(q.options.length === 0 || other[q.id]) && (
            <Input
              className="mt-3"
              placeholder="Your answer"
              value={answers[q.id] ?? ''}
              maxLength={500}
              onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              aria-label={q.question}
            />
          )}
        </Card>
      ))}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={() => submit(true)} className="text-left text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
          I'm a complete beginner: skip the assessment
        </button>
        <Button variant="learn" size="lg" onClick={() => submit(false)}>
          Continue to quick assessment <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- diagnostic
function DiagnosticView({ room, onUpdate }: { room: ClassroomT; onUpdate: (r: ClassroomT) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshSession = useRefreshSession();
  const a = room.pending_assessment;
  if (!a) return <Alert tone="warn">The assessment could not be loaded. Please refresh the page.</Alert>;
  if (busy)
    return <BusyCard title="Checking your answers and building your roadmap…" body="We're mapping what you know against your goal. This can take up to a minute." />;
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display font-semibold tracking-tight text-2xl">Quick assessment</h2>
        <p className="mt-1 text-sm text-muted">
          This is not a test you can fail. It only shows where to start, so answer honestly and skip what you don't know.
        </p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <AssessmentView
        assessment={a}
        submitLabel="See my roadmap"
        onSubmit={async (responses) => {
          setBusy(true);
          setError(null);
          try {
            const r = await api<SubmitResult>(`/api/classroom/classrooms/${room.id}/assessments/${a.id}/submit`, {
              body: { responses },
            });
            onUpdate(r.classroom);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
            refreshSession();
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------- assignment
function AssignmentPanel({ room, module, onChange }: { room: ClassroomT; module: ModuleT; onChange: () => void }) {
  const toast = useToast();
  const [submission, setSubmission] = useState('');
  const [busy, setBusy] = useState<null | 'create' | 'submit'>(null);
  const a: AssignmentT | null = module.assignment;

  const run = async (kind: 'create' | 'submit') => {
    setBusy(kind);
    try {
      if (kind === 'create') await api(`/api/classroom/classrooms/${room.id}/modules/${module.id}/assignment`, { method: 'POST' });
      else await api(`/api/classroom/classrooms/${room.id}/assignments/${a!.id}/submit`, { body: { submission } });
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  if (!a)
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">Prove this milestone with a short practical project, reviewed by your AI teacher.</p>
        <Button size="sm" variant="outline" loading={busy === 'create'} onClick={() => run('create')}>
          <Hammer className="h-4 w-4 text-learn" /> Get a project
        </Button>
      </div>
    );

  return (
    <div className="rounded-xl border border-line bg-sunken/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Hammer className="h-4 w-4 text-learn" /> Milestone project
        </p>
        {a.status === 'graded' && a.score !== null && <Badge tone={a.score >= 0.7 ? 'ok' : 'warn'}>{Math.round(a.score * 100)}%</Badge>}
      </div>
      <Markdown className="mt-3 text-[15px]">{a.brief_md}</Markdown>
      {a.deliverables.length > 0 && (
        <>
          <p className="eyebrow mt-4">Submit</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm">
            {a.deliverables.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </>
      )}
      <p className="eyebrow mt-4">Rubric</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {a.rubric.map((r) => (
          <li key={r.criterion}>
            <span className="font-medium">{r.criterion}</span> <span className="text-muted">({r.points} pts): {r.description}</span>
          </li>
        ))}
      </ul>
      {a.status === 'open' ? (
        <div className="mt-4">
          <Textarea
            rows={5}
            value={submission}
            onChange={(e) => setSubmission(e.target.value)}
            maxLength={8000}
            placeholder="Describe what you built and how, and paste a link (e.g. GitHub). The reviewer can only read what you write here."
            aria-label="Your submission"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted">At least 20 characters.</span>
            <Button variant="learn" size="sm" disabled={submission.trim().length < 20} loading={busy === 'submit'} onClick={() => run('submit')}>
              Submit for review
            </Button>
          </div>
        </div>
      ) : (
        a.feedback && (
          <div className="mt-4 space-y-3 rounded-xl bg-surface p-4">
            <p className="eyebrow">Feedback</p>
            <ul className="space-y-1.5 text-sm">
              {a.feedback.scores.map((s) => (
                <li key={s.criterion}>
                  <span className="font-medium">
                    {s.criterion}: {s.points}/{s.max}
                  </span>{' '}
                  <span className="text-muted">{s.comment}</span>
                </li>
              ))}
            </ul>
            <Markdown className="text-sm">{a.feedback.overall_feedback_md}</Markdown>
            {a.feedback.next_improvements.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {a.feedback.next_improvements.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------- roadmap
function ModuleCard({ room, module, index, onChange }: { room: ClassroomT; module: ModuleT; index: number; onChange: () => void }) {
  const mp = room.progress?.modules.find((m) => m.id === module.id);
  const [open, setOpen] = useState(() => !mp?.done);
  return (
    <Card className="overflow-hidden">
      <button className="flex w-full items-start gap-4 p-5 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-xl font-display font-semibold tracking-tight text-sm',
            mp?.done ? 'bg-ok-soft text-ok' : 'bg-learn-soft text-learn-ink',
          )}
        >
          {mp?.done ? <Trophy className="h-4 w-4" /> : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display font-semibold tracking-tight text-lg leading-snug">{module.title}</span>
          <span className="mt-0.5 block text-sm text-muted">{module.summary}</span>
          {mp && (
            <span className="mt-2 flex items-center gap-3 text-xs text-muted">
              <ProgressBar value={(mp.completed / Math.max(1, mp.total)) * 100} className="h-1.5 max-w-[10rem]" />
              {mp.completed}/{mp.total} lessons
            </span>
          )}
        </span>
        <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t border-line px-5 pb-5">
          <ol className="divide-y divide-line">
            {module.lessons.map((l) => (
              <li key={l.id}>
                <Link to={`/learn/${room.id}/lesson/${l.id}`} className="group flex items-center gap-3 py-3">
                  <LessonStatusIcon status={l.status} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate group-hover:text-learn">{l.title}</span>
                    <span className="text-xs text-muted">
                      {minutesLabel(l.est_minutes)} · {STATUS_LABEL[l.status]}
                      {l.best_score !== null && ` · best ${Math.round(l.best_score * 100)}%`}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ol>
          {module.milestone && (
            <p className="mb-3 mt-2 flex items-start gap-2 text-sm">
              <Flag className="mt-0.5 h-4 w-4 shrink-0 text-learn" aria-hidden />
              <span>
                <span className="font-medium">Milestone: </span>
                {module.milestone}
              </span>
            </p>
          )}
          <AssignmentPanel room={room} module={module} onChange={onChange} />
        </div>
      )}
    </Card>
  );
}

function RoadmapView({ room, onUpdate, refetch }: { room: ClassroomT; onUpdate: (r: ClassroomT) => void; refetch: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [reason, setReason] = useState('');
  const p = room.progress;
  const weak = p?.mastery.filter((m) => m.score < 0.6) ?? [];
  const strong = p?.mastery.filter((m) => m.score >= 0.8) ?? [];

  const propose = useMutation({
    mutationFn: () => api<ClassroomT>(`/api/classroom/classrooms/${room.id}/revisions`, { body: { reason } }),
    onSuccess: (r) => {
      onUpdate(r);
      setAdjustOpen(false);
      setReason('');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });
  const decide = useMutation({
    mutationFn: (action: 'apply' | 'discard') =>
      api<ClassroomT>(`/api/classroom/classrooms/${room.id}/revisions/${room.pending_revision!.id}/${action}`, { method: 'POST' }),
    onSuccess: (r, action) => {
      onUpdate(r);
      toast(action === 'apply' ? 'Roadmap updated. Your completed lessons were kept.' : 'Proposal discarded.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const remove = async () => {
    if (!confirm('Delete this classroom and all its progress? This cannot be undone.')) return;
    try {
      await api(`/api/classroom/classrooms/${room.id}`, { method: 'DELETE' });
      qc.invalidateQueries({ queryKey: CR_LIST });
      navigate('/learn');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {room.status === 'completed' && (
        <Alert tone="info" title="You completed every lesson in this roadmap 🎉">
          Want to go further? Use "Adjust roadmap" to extend it with a new focus.
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          <p className="eyebrow">Your path</p>
          <p className="mt-2 leading-relaxed">{room.roadmap_summary}</p>
          {room.learner_profile.summary && (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              <Badge tone="learn" className="mr-2 capitalize">{room.learner_profile.level}</Badge>
              {room.learner_profile.summary}
            </p>
          )}
          {p?.next_lesson_id && (
            <Button variant="learn" size="lg" className="mt-5" onClick={() => navigate(`/learn/${room.id}/lesson/${p.next_lesson_id}`)}>
              {p.summary.lessons_completed ? 'Continue' : 'Start'}: {p.next_lesson_title}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </Card>
        {p && (
          <Card className="p-6">
            <p className="eyebrow">Progress</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{p.summary.percent}%</p>
            <ProgressBar value={p.summary.percent} className="mt-3" label="Roadmap progress" />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted">Lessons</dt>
                <dd className="font-medium">{p.summary.lessons_completed}/{p.summary.lessons_total}</dd>
              </div>
              <div>
                <dt className="text-muted">Milestones</dt>
                <dd className="font-medium">{p.summary.milestones_reached}/{p.summary.milestones_total}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" /> Remaining</dt>
                <dd className="font-medium">{minutesLabel(p.summary.minutes_remaining)}</dd>
              </div>
              <div>
                <dt className="text-muted">To review</dt>
                <dd className="font-medium">{p.summary.needs_review}</dd>
              </div>
            </dl>
          </Card>
        )}
      </div>

      {(weak.length > 0 || strong.length > 0) && (
        <Card className="p-5">
          <p className="eyebrow">What you know so far</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {strong.map((m) => (
              <Badge key={m.concept} tone="ok">{m.concept}</Badge>
            ))}
            {weak.map((m) => (
              <Badge key={m.concept} tone="warn">{m.concept}: needs work</Badge>
            ))}
          </div>
        </Card>
      )}

      {room.pending_revision && (
        <Card className="border-learn/40 p-6">
          <p className="eyebrow text-learn-ink">Proposed roadmap change (v{room.pending_revision.version})</p>
          <p className="mt-2 leading-relaxed">{room.pending_revision.change_summary}</p>
          <ol className="mt-4 space-y-2 text-sm">
            {room.pending_revision.modules.map((m, i) => (
              <li key={i}>
                <span className="font-medium">{m.title}</span>
                <span className="text-muted"> · {m.lessons.map((l) => l.title).join(' · ')}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">Completed lessons are always kept.</p>
          <div className="mt-4 flex gap-2">
            <Button variant="learn" loading={decide.isPending && decide.variables === 'apply'} onClick={() => decide.mutate('apply')}>Apply changes</Button>
            <Button variant="ghost" loading={decide.isPending && decide.variables === 'discard'} onClick={() => decide.mutate('discard')}>Keep current plan</Button>
          </div>
        </Card>
      )}

      <div className="flex items-end justify-between gap-3">
        <h2 className="font-display font-semibold tracking-tight text-2xl">Roadmap</h2>
        <Button variant="outline" size="sm" onClick={() => setAdjustOpen(true)}>
          <RefreshCw className="h-4 w-4 text-learn" /> Adjust roadmap
        </Button>
      </div>
      <div className="space-y-4">
        {room.modules.map((m, i) => (
          <ModuleCard key={m.id} room={room} module={m} index={i} onChange={refetch} />
        ))}
      </div>
      <div className="pt-6">
        <button onClick={remove} className="flex items-center gap-2 text-sm text-muted hover:text-danger">
          <Trash2 className="h-4 w-4" /> Delete this classroom
        </button>
      </div>

      <Dialog
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Adjust your roadmap"
        description="Tell your teacher what changed: a new focus, a deadline, something too easy or too hard. You'll see the proposal before anything changes."
      >
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            propose.mutate();
          }}
          className="space-y-4"
        >
          <Textarea
            rows={4}
            value={reason}
            maxLength={800}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. I have an interview in 3 weeks, so focus on the most-asked topics"
            aria-label="What changed"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button type="submit" variant="learn" loading={propose.isPending} disabled={reason.trim().length < 5}>
              <MessageSquareText className="h-4 w-4" /> Propose changes
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

export default function ClassroomPage() {
  const { classroomId = '' } = useParams();
  const qc = useQueryClient();
  const room = useQuery({
    queryKey: crKey(classroomId),
    queryFn: () => api<ClassroomT>(`/api/classroom/classrooms/${classroomId}`),
  });
  const update = (r: ClassroomT) => {
    qc.setQueryData(crKey(classroomId), r);
    qc.invalidateQueries({ queryKey: CR_LIST });
  };

  return (
    <PageShell>
      <div className="container-page max-w-4xl py-8 sm:py-12">
        <Link to="/learn" className="text-sm text-muted hover:text-ink">← All classrooms</Link>
        {room.isLoading ? (
          <div className="grid place-items-center py-24">
            <Spinner label="Loading classroom" />
          </div>
        ) : room.isError || !room.data ? (
          <ErrorState message={errorMessage(room.error)} onRetry={() => room.refetch()} />
        ) : (
          <>
            <div className="mb-8 mt-3 flex items-start gap-3">
              <div className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-learn-soft text-learn">
                <Target className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <h1 className="font-display font-semibold tracking-tight text-3xl leading-tight sm:text-4xl">{room.data.title}</h1>
                <p className="mt-1 text-sm text-muted">{room.data.goal_text}</p>
              </div>
            </div>
            {room.data.status === 'intake' && <IntakeView room={room.data} onUpdate={update} />}
            {room.data.status === 'diagnostic' && <DiagnosticView room={room.data} onUpdate={update} />}
            {(room.data.status === 'active' || room.data.status === 'completed') && (
              <RoadmapView room={room.data} onUpdate={update} refetch={() => room.refetch()} />
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
