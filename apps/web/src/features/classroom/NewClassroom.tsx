import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageShell } from '@/components/layout/AppShell';
import { Alert, Button, Card, Spinner } from '@/components/ui/primitives';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useEnsureSession, useRefreshSession } from '@/lib/session';
import type { ClassroomT } from '@/lib/types';
import { CR_LIST, crKey } from './shared';
import { GoalForm } from './LearnHome';

/** Creates a classroom from ?goal=… and redirects to it. */
export default function NewClassroom() {
  const [params] = useSearchParams();
  const goal = (params.get('goal') ?? '').trim();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ensureSession = useEnsureSession();
  const refreshSession = useRefreshSession();
  const [error, setError] = useState<ApiError | Error | null>(null);
  const started = useRef(false);

  const create = async () => {
    setError(null);
    try {
      await ensureSession();
      const room = await api<ClassroomT>('/api/classroom/classrooms', { body: { goal } });
      qc.setQueryData(crKey(room.id), room);
      qc.invalidateQueries({ queryKey: CR_LIST });
      refreshSession();
      navigate(`/learn/${room.id}`, { replace: true });
    } catch (e) {
      setError(e as Error);
    }
  };

  useEffect(() => {
    if (goal.length >= 5 && !started.current) {
      started.current = true;
      create();
    }
  }, [goal]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageShell>
      <div className="container-page max-w-2xl py-16">
        {goal.length < 5 ? (
          <>
            <h1 className="font-display font-semibold tracking-tight text-3xl">Start a new classroom</h1>
            <div className="mt-6">
              <GoalForm />
            </div>
          </>
        ) : error ? (
          <Card className="p-6">
            <h1 className="font-display font-semibold tracking-tight text-2xl">We couldn't create your classroom</h1>
            <Alert tone="danger" className="mt-4">
              {errorMessage(error)}
            </Alert>
            <div className="mt-5 flex flex-wrap gap-2">
              {error instanceof ApiError && error.code === 'classroom_limit' ? (
                <>
                  <Button variant="learn" onClick={() => navigate('/signup?next=/learn')}>Create free account</Button>
                  <Button variant="outline" onClick={() => navigate('/learn')}>Back to classrooms</Button>
                </>
              ) : (
                <>
                  <Button variant="learn" onClick={create}>Try again</Button>
                  <Link to="/learn" className="inline-flex h-10 items-center px-4 text-sm text-muted hover:text-ink">Back</Link>
                </>
              )}
            </div>
          </Card>
        ) : (
          <div className="text-center">
            <Spinner className="justify-center" />
            <h1 className="mt-4 font-display font-semibold tracking-tight text-2xl">Understanding your goal…</h1>
            <p className="mx-auto mt-2 max-w-md text-muted">"{goal}"</p>
            <p className="mt-6 text-sm text-muted">Preparing a few questions so your classroom fits you.</p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
