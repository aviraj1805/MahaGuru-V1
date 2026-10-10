import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock,
  ExternalLink,
  GraduationCap,
  Lightbulb,
  ListChecks,
  MessageCircle,
  BookOpen,
} from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Markdown } from '@/components/ui/Markdown';
import { Alert, Badge, Button, Card, ErrorState, Spinner, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { useRefreshSession } from '@/lib/session';
import { postStream } from '@/lib/sse';
import type { Assessment, LessonDetail, SubmitResult } from '@/lib/types';
import { cn, minutesLabel } from '@/lib/utils';
import { AssessmentView, CR_LIST, crKey, lessonKey, STATUS_LABEL } from './shared';

type Tab = 'lesson' | 'practice' | 'teacher';

function TeacherPanel({ classroomId, lesson }: { classroomId: string; lesson: LessonDetail }) {
  const qc = useQueryClient();
  const refreshSession = useRefreshSession();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingQ, setPendingQ] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [lesson.chat.length, answer, pendingQ]);

  const ask = async (e?: FormEvent) => {
    e?.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setText('');
    setBusy(true);
    setError(null);
    setPendingQ(q);
    setAnswer('');
    let failed: string | null = null;
    try {
      await postStream(`/api/classroom/classrooms/${classroomId}/teacher`, { content: q, lesson_id: lesson.id }, (ev) => {
        if (ev.event === 'token') setAnswer((a) => (a ?? '') + ev.data.t);
        if (ev.event === 'error') failed = ev.data.message;
      });
    } catch (err) {
      failed = errorMessage(err);
    }
    if (failed) {
      setError(failed);
      setText(q);
    }
    await qc.invalidateQueries({ queryKey: lessonKey(classroomId, lesson.id) });
    setPendingQ(null);
    setAnswer(null);
    setBusy(false);
    refreshSession();
  };

  const suggestions = ['Explain this more simply', 'Give me another example', 'How is this used in real projects?'];

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <GraduationCap className="h-4 w-4 text-learn" aria-hidden />
        <h2 className="font-medium">Ask your teacher</h2>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {lesson.chat.length === 0 && !pendingQ && (
          <div className="text-sm text-muted">
            <p>Stuck on something? Ask anything about this lesson. The teacher knows your goal and level.</p>
            <div className="mt-3 flex flex-col gap-2">
              {suggestions.map((s) => (
                <button key={s} onClick={() => setText(s)} className="rounded-lg border border-line px-3 py-2 text-left hover:border-learn/40 hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {lesson.chat.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="ml-6 whitespace-pre-wrap rounded-2xl rounded-br-md bg-learn-soft px-3.5 py-2 text-sm">
              {m.content}
            </div>
          ) : (
            <Markdown key={m.id} className="text-sm">{m.content}</Markdown>
          ),
        )}
        {pendingQ && (
          <>
            <div className="ml-6 whitespace-pre-wrap rounded-2xl rounded-br-md bg-learn-soft px-3.5 py-2 text-sm">{pendingQ}</div>
            {answer ? <Markdown className="text-sm">{answer}</Markdown> : <Spinner label="Thinking" />}
          </>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <div ref={end} />
      </div>
      <form onSubmit={ask} className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-1.5 focus-within:border-learn/40">
          <Textarea
            autoGrow
            rows={1}
            maxRows={5}
            value={text}
            maxLength={3000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask a question…"
            aria-label="Ask your teacher"
            className="border-0 bg-transparent py-2 text-sm focus:ring-0"
          />
          <Button type="submit" variant="learn" size="icon" className="shrink-0 rounded-lg" disabled={!text.trim() || busy} aria-label="Ask">
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function PracticeSection({ classroomId, lesson, onDone }: { classroomId: string; lesson: LessonDetail; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const refreshSession = useRefreshSession();
  const [quiz, setQuiz] = useState<Assessment | null>(lesson.latest_quiz);
  const [busy, setBusy] = useState<null | 'new' | 'submit'>(null);
  useEffect(() => {
    setQuiz(lesson.latest_quiz);
  }, [lesson.latest_quiz]);

  const newQuiz = async () => {
    setBusy('new');
    try {
      setQuiz(await api<Assessment>(`/api/classroom/classrooms/${classroomId}/lessons/${lesson.id}/quiz`, { method: 'POST' }));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
      refreshSession();
    }
  };

  const submit = async (responses: Record<string, string | number>) => {
    if (!quiz) return;
    setBusy('submit');
    try {
      const r = await api<SubmitResult>(`/api/classroom/classrooms/${classroomId}/assessments/${quiz.id}/submit`, { body: { responses } });
      setQuiz(r.assessment);
      qc.setQueryData(crKey(classroomId), r.classroom);
      qc.invalidateQueries({ queryKey: CR_LIST });
      toast(
        (r.assessment.score ?? 0) >= 0.7
          ? 'Lesson complete! Your progress has been updated.'
          : "Not quite yet. We've added a fresh explanation to the lesson.",
        (r.assessment.score ?? 0) >= 0.7 ? 'ok' : 'error',
      );
      onDone();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
      refreshSession();
    }
  };

  return (
    <section aria-labelledby="practice" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="practice" className="font-display font-semibold tracking-tight text-2xl">Practice</h2>
          <p className="mt-1 text-sm text-muted">Score 70% or more to complete the lesson. Below that, you'll get a targeted re-explanation.</p>
        </div>
        <Button variant={quiz ? 'outline' : 'learn'} onClick={newQuiz} loading={busy === 'new'}>
          <ListChecks className="h-4 w-4" /> {quiz ? 'New practice quiz' : 'Start practice quiz'}
        </Button>
      </div>
      {busy === 'new' && !quiz && <Spinner label="Writing questions for you" />}
      {quiz && (
        <AssessmentView
          key={quiz.id}
          assessment={quiz}
          onSubmit={submit}
          submitting={busy === 'submit'}
          submitLabel="Check my answers"
        />
      )}
    </section>
  );
}

export default function LessonPage() {
  const { classroomId = '', lessonId = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const refreshSession = useRefreshSession();
  const [tab, setTab] = useState<Tab>('lesson');
  const [genError, setGenError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);
  const generating = useRef(false);

  const lesson = useQuery({
    queryKey: lessonKey(classroomId, lessonId),
    queryFn: () => api<LessonDetail>(`/api/classroom/classrooms/${classroomId}/lessons/${lessonId}`),
  });

  const generate = async () => {
    if (generating.current) return;
    generating.current = true;
    setGenError(null);
    try {
      const l = await api<LessonDetail>(`/api/classroom/classrooms/${classroomId}/lessons/${lessonId}/generate`, { method: 'POST' });
      qc.setQueryData(lessonKey(classroomId, lessonId), l);
      qc.invalidateQueries({ queryKey: crKey(classroomId) });
      refreshSession();
    } catch (e) {
      setGenError(errorMessage(e));
    } finally {
      generating.current = false;
    }
  };

  useEffect(() => {
    setTab('lesson');
    if (lesson.data && !lesson.data.has_content) generate();
    else if (lesson.data?.status === 'not_started') generate(); // marks in progress, no AI call
  }, [lesson.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const complete = async () => {
    setCompleting(true);
    try {
      await api(`/api/classroom/classrooms/${classroomId}/lessons/${lessonId}/complete`, { method: 'POST' });
      await Promise.all([
        qc.invalidateQueries({ queryKey: lessonKey(classroomId, lessonId) }),
        qc.invalidateQueries({ queryKey: crKey(classroomId) }),
        qc.invalidateQueries({ queryKey: CR_LIST }),
      ]);
      toast('Marked as complete.');
      if (lesson.data?.next_lesson_id) navigate(`/learn/${classroomId}/lesson/${lesson.data.next_lesson_id}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setCompleting(false);
    }
  };

  const l = lesson.data;
  return (
    <PageShell footer={false}>
      {lesson.isLoading ? (
        <div className="grid place-items-center py-24">
          <Spinner label="Loading lesson" />
        </div>
      ) : lesson.isError || !l ? (
        <ErrorState message={errorMessage(lesson.error)} onRetry={() => lesson.refetch()} />
      ) : (
        <div className="mx-auto grid max-w-7xl lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 px-4 py-6 sm:px-8 lg:py-10">
            <Link to={`/learn/${classroomId}`} className="text-sm text-muted hover:text-ink">
              ← Roadmap
            </Link>
            <p className="eyebrow mt-4 text-learn">{l.module_title}</p>
            <h1 className="mt-1 font-display font-semibold tracking-tight text-3xl leading-tight sm:text-4xl">{l.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge tone={l.status === 'completed' ? 'ok' : l.status === 'needs_review' ? 'warn' : 'learn'}>{STATUS_LABEL[l.status]}</Badge>
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {minutesLabel(l.est_minutes)}</span>
              {l.best_score !== null && <span>Best quiz score {Math.round(l.best_score * 100)}%</span>}
            </div>

            <div className="mt-6 flex gap-1 rounded-xl bg-sunken p-1 lg:hidden" role="tablist">
              {([
                ['lesson', 'Lesson', BookOpen],
                ['practice', 'Practice', ListChecks],
                ['teacher', 'Ask teacher', MessageCircle],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium', tab === key ? 'bg-surface shadow-sm' : 'text-muted')}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <div className={cn('mt-8 space-y-8', tab !== 'lesson' && 'hidden lg:block')}>
              {l.objectives.length > 0 && (
                <Card className="p-5">
                  <p className="eyebrow">By the end you'll be able to</p>
                  <ul className="mt-2 space-y-1.5 text-[15px]">
                    {l.objectives.map((o) => (
                      <li key={o} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-learn" /> {o}</li>
                    ))}
                  </ul>
                </Card>
              )}
              {!l.content_md ? (
                genError ? (
                  <Alert tone="danger" title="We couldn't write this lesson" action={<Button size="sm" variant="outline" onClick={generate}>Retry</Button>}>
                    {genError}
                  </Alert>
                ) : (
                  <Card className="p-10 text-center">
                    <Spinner className="justify-center" />
                    <p className="mt-3 font-display font-semibold tracking-tight text-xl">Writing this lesson for you…</p>
                    <p className="mt-1 text-sm text-muted">Tailored to your level and the concepts you're working on.</p>
                  </Card>
                )
              ) : (
                <>
                  {l.remedial_md && (
                    <Card className="border-warn/40 bg-warn-soft/60 p-5">
                      <p className="flex items-center gap-2 font-medium"><Lightbulb className="h-4 w-4 text-warn" /> Another way to look at it</p>
                      <Markdown className="mt-2">{l.remedial_md}</Markdown>
                    </Card>
                  )}
                  <article>
                    <Markdown className="text-[16px]">{l.content_md}</Markdown>
                  </article>
                  {l.key_takeaways.length > 0 && (
                    <Card className="p-5">
                      <p className="eyebrow">Key takeaways</p>
                      <ul className="mt-2 space-y-1.5">
                        {l.key_takeaways.map((k) => (
                          <li key={k} className="flex gap-2.5"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-learn" />{k}</li>
                        ))}
                      </ul>
                    </Card>
                  )}
                  {l.resources.length > 0 && (
                    <section>
                      <h2 className="font-display font-semibold tracking-tight text-xl">Go deeper</h2>
                      <p className="mt-1 text-xs text-muted">Links from trusted sources, checked before showing.</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {l.resources.map((r) => (
                          <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="group rounded-xl border border-line bg-surface p-4 hover:border-learn/40">
                            <p className="flex items-start justify-between gap-2 font-medium">
                              {r.title} <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted group-hover:text-learn" />
                            </p>
                            <p className="mt-1 text-sm text-muted">{r.why}</p>
                            <p className="mt-2 truncate text-xs text-muted">{new URL(r.url).hostname}</p>
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>

            {l.content_md && (
              <div className={cn('mt-12', tab !== 'practice' && 'hidden lg:block', tab === 'practice' && 'mt-8')}>
                <PracticeSection classroomId={classroomId} lesson={l} onDone={() => lesson.refetch()} />
              </div>
            )}

            <div className={cn('lg:hidden', tab !== 'teacher' && 'hidden', 'mt-8 overflow-hidden rounded-2xl border border-line bg-surface')}>
              <TeacherPanel classroomId={classroomId} lesson={l} />
            </div>

            <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={!l.prev_lesson_id} onClick={() => navigate(`/learn/${classroomId}/lesson/${l.prev_lesson_id}`)}>
                  <ArrowLeft className="h-4 w-4" /> Previous
                </Button>
                <Button variant="ghost" size="sm" disabled={!l.next_lesson_id} onClick={() => navigate(`/learn/${classroomId}/lesson/${l.next_lesson_id}`)}>
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
              {l.status !== 'completed' && l.content_md && (
                <Button variant="outline" onClick={complete} loading={completing}>
                  <CheckCircle2 className="h-4 w-4 text-ok" /> Mark as complete
                </Button>
              )}
            </div>
          </div>
          <aside className="hidden border-l border-line bg-surface/60 lg:block">
            <div className="sticky top-16 h-[calc(100dvh-4rem)]">
              <TeacherPanel classroomId={classroomId} lesson={l} />
            </div>
          </aside>
        </div>
      )}
    </PageShell>
  );
}
