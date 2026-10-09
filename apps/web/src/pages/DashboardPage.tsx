import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Alert, Button, Card, EmptyState, ErrorState, ProgressBar, Skeleton } from '@/components/ui/primitives';
import { ClassroomCard } from '@/features/classroom/LearnHome';
import { STAGE_LABEL } from '@/features/studentgpt/parts';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { ClassroomSummary, Stage, Usage } from '@/lib/types';
import { timeAgo } from '@/lib/utils';

type Dashboard = {
  classrooms: ClassroomSummary[];
  reflections: { id: string; title: string; stage: Stage; has_clarity: boolean; updated_at: string }[];
  usage: Usage;
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { data: session, isLoading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const user = session?.user;
  const dash = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api<Dashboard>('/api/dashboard'),
    enabled: !!user,
  });

  if (!sessionLoading && !user)
    return (
      <PageShell>
        <div className="container-page max-w-2xl py-20 text-center">
          <h1 className="font-serif text-4xl">Your dashboard</h1>
          <p className="mt-3 text-muted">Start a reflection or a classroom and your ongoing work will appear here.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button variant="reflect" onClick={() => navigate('/reflect')}><Sparkles className="h-4 w-4" /> Reflect with StudentGPT</Button>
            <Button variant="learn" onClick={() => navigate('/learn')}><BookOpen className="h-4 w-4" /> Start a Classroom</Button>
          </div>
        </div>
      </PageShell>
    );

  const continueRoom = dash.data?.classrooms.find((c) => c.next_lesson_id && c.status === 'active');

  return (
    <PageShell>
      <div className="container-page py-10 sm:py-14">
        <p className="eyebrow">{greeting()}</p>
        <h1 className="mt-2 font-serif text-4xl">{user?.display_name ? `Welcome back, ${user.display_name}` : 'Welcome back'}</h1>
        {user?.is_guest && (
          <Alert tone="info" className="mt-6 max-w-3xl" title="You're exploring as a guest">
            <Link to="/signup" className="font-medium underline">Create a free account</Link> to keep your work beyond 7 days and get a bigger daily allowance.
          </Alert>
        )}

        {dash.isLoading || sessionLoading ? (
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <Skeleton className="h-40 rounded-2xl md:col-span-2" />
            <Skeleton className="h-40 rounded-2xl" />
          </div>
        ) : dash.isError || !dash.data ? (
          <ErrorState message={errorMessage(dash.error)} onRetry={() => dash.refetch()} />
        ) : (
          <>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <Card className="p-6 md:col-span-2">
                {continueRoom ? (
                  <>
                    <p className="eyebrow text-learn">Continue learning</p>
                    <h2 className="mt-2 font-serif text-2xl">{continueRoom.title}</h2>
                    <p className="mt-1 text-sm text-muted">Next: {continueRoom.next_lesson_title}</p>
                    <ProgressBar value={continueRoom.percent} className="mt-4 max-w-md" />
                    <Button variant="learn" className="mt-5" onClick={() => navigate(`/learn/${continueRoom.id}/lesson/${continueRoom.next_lesson_id}`)}>
                      Resume lesson <ArrowRight className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="eyebrow text-learn">Classroom</p>
                    <h2 className="mt-2 font-serif text-2xl">Learn something new</h2>
                    <p className="mt-1 text-sm text-muted">Turn a goal into a personalised roadmap with lessons, practice and projects.</p>
                    <Button variant="learn" className="mt-5" onClick={() => navigate('/learn')}>Set a learning goal <ArrowRight className="h-4 w-4" /></Button>
                  </>
                )}
              </Card>
              <Card className="space-y-4 p-6">
                <p className="eyebrow">Today's allowance</p>
                {(['message', 'classroom'] as const).map((k) => (
                  <div key={k}>
                    <div className="flex justify-between text-sm">
                      <span>{k === 'message' ? 'StudentGPT' : 'Classroom'}</span>
                      <span className="text-muted">{dash.data.usage[k].used}/{dash.data.usage[k].limit}</span>
                    </div>
                    <ProgressBar value={(dash.data.usage[k].used / dash.data.usage[k].limit) * 100} tone={k === 'message' ? 'reflect' : 'learn'} className="mt-1.5" />
                  </div>
                ))}
              </Card>
            </div>

            <section className="mt-12">
              <div className="flex items-end justify-between">
                <h2 className="font-serif text-2xl">Classrooms</h2>
                <Link to="/learn" className="text-sm text-learn hover:underline">New classroom</Link>
              </div>
              {dash.data.classrooms.length ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {dash.data.classrooms.map((c) => <ClassroomCard key={c.id} c={c} />)}
                </div>
              ) : (
                <Card className="mt-4"><EmptyState icon={<BookOpen className="h-5 w-5" />} title="No classrooms yet">Set a goal to get your first personalised roadmap.</EmptyState></Card>
              )}
            </section>

            <section className="mt-12">
              <div className="flex items-end justify-between">
                <h2 className="font-serif text-2xl">Recent reflections</h2>
                <Link to="/reflect" className="text-sm text-reflect hover:underline">New reflection</Link>
              </div>
              {dash.data.reflections.length ? (
                <Card className="mt-4 divide-y divide-line">
                  {dash.data.reflections.map((r) => (
                    <Link key={r.id} to={`/reflect/${r.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-sunken">
                      <span className="flex min-w-0 items-center gap-3">
                        <Sparkles className="h-4 w-4 shrink-0 text-reflect" />
                        <span className="truncate">{r.title}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{r.has_clarity ? 'Clarity reached' : STAGE_LABEL[r.stage]} · {timeAgo(r.updated_at)}</span>
                    </Link>
                  ))}
                </Card>
              ) : (
                <Card className="mt-4"><EmptyState icon={<Sparkles className="h-5 w-5" />} title="No reflections yet">When something feels confusing, talk it through with StudentGPT.</EmptyState></Card>
              )}
            </section>
          </>
        )}
      </div>
    </PageShell>
  );
}
