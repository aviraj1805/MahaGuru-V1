import { useState, type FormEvent } from 'react';
import { CheckCircle2, Circle, CircleDot, RotateCcw, XCircle } from 'lucide-react';
import { Badge, Button, Card, Textarea } from '@/components/ui/primitives';
import type { Assessment, LessonStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

export const crKey = (id: string) => ['cr', id];
export const lessonKey = (cid: string, lid: string) => ['cr', cid, 'lesson', lid];
export const CR_LIST = ['cr', 'list'];

export function LessonStatusIcon({ status, className }: { status: LessonStatus; className?: string }) {
  const map = {
    completed: <CheckCircle2 className={cn('h-5 w-5 text-ok', className)} aria-label="Completed" />,
    in_progress: <CircleDot className={cn('h-5 w-5 text-learn', className)} aria-label="In progress" />,
    needs_review: <RotateCcw className={cn('h-5 w-5 text-warn', className)} aria-label="Needs review" />,
    not_started: <Circle className={cn('h-5 w-5 text-line', className)} aria-label="Not started" />,
  };
  return map[status];
}

export const STATUS_LABEL: Record<LessonStatus, string> = {
  completed: 'Completed',
  in_progress: 'In progress',
  needs_review: 'Review suggested',
  not_started: 'Not started',
};

/** Renders a pending assessment as a form, or a graded one with per-item feedback. */
export function AssessmentView({
  assessment,
  onSubmit,
  submitting,
  submitLabel = 'Submit answers',
}: {
  assessment: Assessment;
  onSubmit?: (responses: Record<string, string | number>) => void;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const graded = assessment.status === 'graded';
  const [answers, setAnswers] = useState<Record<string, string | number>>(() => ({ ...(assessment.responses ?? {}) }));
  const results = new Map((assessment.results ?? []).map((r) => [r.id, r]));
  const answered = assessment.items.filter((i) => answers[i.id] !== undefined && answers[i.id] !== '').length;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.(answers);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {graded && assessment.score !== null && (
        <Card className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="eyebrow">Your score</p>
            <p className="mt-1 font-serif text-3xl">{Math.round(assessment.score * 100)}%</p>
          </div>
          <Badge tone={assessment.score >= 0.7 ? 'ok' : 'warn'}>
            {assessment.score >= 0.7 ? 'Well done' : 'Worth another look'}
          </Badge>
        </Card>
      )}
      {assessment.items.map((item, n) => {
        const r = results.get(item.id);
        return (
          <Card key={item.id} className="p-5">
            <fieldset disabled={graded || submitting}>
              <legend className="flex w-full items-start justify-between gap-3">
                <span className="font-medium leading-relaxed">
                  <span className="mr-2 text-muted">{n + 1}.</span>
                  {item.question}
                </span>
                {r && (r.score >= 0.7 ? <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" aria-label="Correct" /> : <XCircle className="h-5 w-5 shrink-0 text-danger" aria-label="Not quite" />)}
              </legend>
              {item.type === 'mcq' ? (
                <div className="mt-3 space-y-2">
                  {item.options.map((opt, idx) => {
                    const chosen = Number(answers[item.id]) === idx && answers[item.id] !== undefined && answers[item.id] !== '';
                    const correct = graded && r?.correct_index === idx;
                    const wrongPick = graded && chosen && !correct;
                    return (
                      <label
                        key={idx}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-2.5 text-[15px] transition-colors',
                          chosen && !graded ? 'border-learn bg-learn-soft' : 'border-line hover:bg-sunken',
                          correct && 'border-ok/50 bg-ok-soft',
                          wrongPick && 'border-danger/40 bg-danger-soft',
                          graded && 'cursor-default hover:bg-transparent',
                        )}
                      >
                        <input
                          type="radio"
                          name={item.id}
                          className="mt-1 accent-[rgb(var(--learn))]"
                          checked={chosen}
                          onChange={() => setAnswers((a) => ({ ...a, [item.id]: idx }))}
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <Textarea
                  className="mt-3"
                  rows={3}
                  maxLength={2000}
                  placeholder="Answer in your own words. It's fine to say what you're unsure about."
                  value={String(answers[item.id] ?? '')}
                  onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: e.target.value }))}
                  aria-label={`Answer to question ${n + 1}`}
                />
              )}
            </fieldset>
            {r && (
              <div className="mt-3 rounded-xl bg-sunken p-3.5 text-sm leading-relaxed">
                <p>{r.feedback}</p>
                {r.explanation && r.explanation !== r.feedback && <p className="mt-1.5 text-muted">{r.explanation}</p>}
              </div>
            )}
          </Card>
        );
      })}
      {!graded && onSubmit && (
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {answered}/{assessment.items.length} answered. Skipped questions count as "don't know yet", and that's okay.
          </p>
          <Button type="submit" variant="learn" size="lg" loading={submitting}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
