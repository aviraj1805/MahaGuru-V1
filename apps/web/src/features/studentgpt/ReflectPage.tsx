import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  MoreHorizontal,
  PanelRight,
  PanelLeft,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { PageShell } from '@/components/layout/AppShell';
import { Alert, Button, Dialog, ErrorState, Input, Skeleton, Spinner, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useEnsureSession, useRefreshSession, useSession } from '@/lib/session';
import { postStream } from '@/lib/sse';
import type { ChatMessage, Conversation, ConversationSummary, Helpline } from '@/lib/types';
import { cn, timeAgo } from '@/lib/utils';
import { ClarityCardView, ExploredPanel, REFLECT_STARTERS, SafetyCard } from './parts';

const MAX_CHARS = 4000;
const LIST_KEY = ['sg', 'list'];
const convKey = (id: string) => ['sg', 'conv', id];

// ---------------------------------------------------------------- sidebar
function ConversationList({ activeId, onPick }: { activeId?: string; onPick?: () => void }) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ConversationSummary | null>(null);
  const [title, setTitle] = useState('');
  const list = useQuery({
    queryKey: LIST_KEY,
    queryFn: () => api<ConversationSummary[]>('/api/studentgpt/conversations'),
    enabled: !!session?.user,
  });

  const remove = async (c: ConversationSummary) => {
    setMenu(null);
    if (!confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    try {
      await api(`/api/studentgpt/conversations/${c.id}`, { method: 'DELETE' });
      await qc.invalidateQueries({ queryKey: LIST_KEY });
      if (c.id === activeId) navigate('/reflect');
      toast('Conversation deleted.');
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  };

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renaming || !title.trim()) return;
    try {
      await api(`/api/studentgpt/conversations/${renaming.id}`, { method: 'PATCH', body: { title } });
      await qc.invalidateQueries({ queryKey: ['sg'] });
      setRenaming(null);
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            navigate('/reflect');
            onPick?.();
          }}
        >
          <Plus className="h-4 w-4 text-reflect" /> New reflection
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {list.isLoading && session?.user && (
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        )}
        {list.data?.length === 0 && <p className="px-3 py-4 text-sm text-muted">Your reflections will appear here.</p>}
        <ul className="space-y-0.5">
          {list.data?.map((c) => (
            <li key={c.id} className="group relative">
              <Link
                to={`/reflect/${c.id}`}
                onClick={onPick}
                className={cn(
                  'block rounded-lg px-3 py-2 pr-9 text-sm hover:bg-sunken',
                  c.id === activeId && 'bg-reflect-soft text-reflect-ink hover:bg-reflect-soft',
                )}
              >
                <span className="block truncate">{c.title}</span>
                <span className="text-xs text-muted">
                  {timeAgo(c.updated_at)}
                  {c.has_clarity && ' · clarity'}
                </span>
              </Link>
              <button
                className="absolute right-1.5 top-2 rounded-md p-1 text-muted opacity-100 hover:bg-surface md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                aria-label={`Options for ${c.title}`}
                onClick={() => setMenu(menu === c.id ? null : c.id)}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menu === c.id && (
                <div className="absolute right-1 top-9 z-10 w-36 rounded-xl border border-line bg-surface p-1 shadow-lift">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-sunken"
                    onClick={() => {
                      setMenu(null);
                      setRenaming(c);
                      setTitle(c.title);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Rename
                  </button>
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-danger hover:bg-danger-soft"
                    onClick={() => remove(c)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
      <Dialog open={!!renaming} onClose={() => setRenaming(null)} title="Rename conversation">
        <form onSubmit={rename} className="space-y-4">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Title" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="reflect" disabled={!title.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- composer
function Composer({
  onSend,
  disabled,
  initial = '',
  autoFocus,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  initial?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  useEffect(() => setText(initial), [initial]);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-1.5 shadow-soft focus-within:border-reflect/40">
      <Textarea
        autoGrow
        rows={1}
        maxRows={8}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        maxLength={MAX_CHARS}
        placeholder="Write freely. There are no wrong answers here…"
        aria-label="Your message"
        className="border-0 bg-transparent focus:ring-0"
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <span className={cn('text-xs text-muted', text.length > MAX_CHARS * 0.9 ? 'visible' : 'invisible')}>
          {text.length}/{MAX_CHARS}
        </span>
        <Button type="submit" variant="reflect" size="icon" className="h-9 w-9 rounded-full" disabled={!text.trim() || disabled} aria-label="Send">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- message bubbles
function Bubble({ m, streaming }: { m: Pick<ChatMessage, 'role' | 'content'>; streaming?: boolean }) {
  if (m.role === 'user')
    return (
      <div className="flex justify-end animate-fade-up">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-sunken px-4 py-2.5 text-[15px] leading-relaxed">
          {m.content}
        </div>
      </div>
    );
  return (
    <div className="flex gap-3 animate-fade-up">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-reflect-soft text-reflect" aria-hidden>
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 whitespace-pre-wrap text-[15.5px] leading-[1.75] text-ink">
        {m.content}
        {streaming && <span className="ml-0.5 inline-block h-4 w-[3px] translate-y-0.5 animate-pulse bg-reflect" />}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-3" aria-label="StudentGPT is thinking">
      <div className="grid h-7 w-7 place-items-center rounded-full bg-reflect-soft text-reflect">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-reflect animate-pulse3" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- conversation view
function ConversationView({ id, pending }: { id: string; pending?: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const refreshSession = useRefreshSession();
  const conv = useQuery({ queryKey: convKey(id), queryFn: () => api<Conversation>(`/api/studentgpt/conversations/${id}`) });
  const [streamText, setStreamText] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [safety, setSafety] = useState<{ level: 'elevated' | 'crisis'; helplines: Helpline[] } | null>(null);
  const [panel, setPanel] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sentPending = useRef(false);

  const data = conv.data;
  const userTurns = data?.messages.filter((m) => m.role === 'user').length ?? 0;

  useEffect(() => {
    if (data && data.risk_level !== 'none' && !safety) setSafety({ level: data.risk_level, helplines: data.helplines });
  }, [data, safety]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [data?.messages.length, streamText, optimistic, data?.clarity]);

  const send = useCallback(
    async (text: string) => {
      setError(null);
      setBusy(true);
      setOptimistic(text);
      setStreamText('');
      let failed: string | null = null;
      try {
        await postStream(`/api/studentgpt/conversations/${id}/messages`, { content: text }, (ev) => {
          if (ev.event === 'token') setStreamText((s) => (s ?? '') + ev.data.t);
          else if (ev.event === 'safety') setSafety({ level: ev.data.level, helplines: ev.data.helplines });
          else if (ev.event === 'done') {
            // Reply saved: refresh the conversation (the record update continues server-side).
            qc.invalidateQueries({ queryKey: convKey(id) }).then(() => {
              setOptimistic(null);
              setStreamText(null);
            });
          } else if (ev.event === 'state') {
            qc.invalidateQueries({ queryKey: convKey(id) });
            qc.invalidateQueries({ queryKey: LIST_KEY });
          } else if (ev.event === 'error') failed = ev.data.message;
        });
      } catch (e) {
        failed = errorMessage(e);
        if (e instanceof ApiError && e.code === 'quota_exceeded') failed = e.message;
      }
      if (failed) {
        setError(failed);
        setDraft(text);
        setOptimistic(null);
        setStreamText(null);
      }
      setBusy(false);
      refreshSession();
    },
    [id, qc, refreshSession],
  );

  useEffect(() => {
    if (pending && data && !sentPending.current && data.messages.length === 0) {
      sentPending.current = true;
      send(pending);
    }
  }, [pending, data, send]);

  const clarity = useMutation({
    mutationFn: () => api<Conversation>(`/api/studentgpt/conversations/${id}/clarity`, { method: 'POST' }),
    onSuccess: (c) => {
      qc.setQueryData(convKey(id), c);
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (conv.isLoading)
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner label="Opening conversation" />
      </div>
    );
  if (conv.isError || !data)
    return (
      <div className="flex-1">
        <ErrorState message={errorMessage(conv.error)} onRetry={() => conv.refetch()} />
      </div>
    );

  const showPending = optimistic !== null;
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <h1 className="truncate font-serif text-lg">{data.title}</h1>
          <div className="flex shrink-0 items-center gap-1.5">
            {!data.clarity && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => clarity.mutate()}
                loading={clarity.isPending}
                disabled={userTurns < 3 || busy}
                title={userTurns < 3 ? 'Available after a few messages' : 'Summarise what you discovered'}
                aria-label="Wrap up"
              >
                <Wand2 className="h-4 w-4 text-reflect" />
                <span className="hidden sm:inline">Wrap up</span>
              </Button>
            )}
            <Button size="icon" variant="ghost" onClick={() => setPanel((p) => !p)} aria-label="What we've explored" aria-pressed={panel}>
              <PanelRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl space-y-7 px-4 py-8 sm:px-6">
            {data.messages.length === 0 && !showPending && (
              <p className="text-center text-sm text-muted">Start by sharing what's on your mind.</p>
            )}
            {data.messages.map((m) => (
              <Bubble key={m.id} m={m} />
            ))}
            {showPending && (
              <>
                <Bubble m={{ role: 'user', content: optimistic! }} />
                {safety && <SafetyCard {...safety} />}
                {streamText ? <Bubble m={{ role: 'assistant', content: streamText }} streaming={busy} /> : <Thinking />}
              </>
            )}
            {!showPending && safety && <SafetyCard {...safety} />}
            {error && (
              <Alert tone="danger" title="Your message wasn't sent">
                {error}
              </Alert>
            )}
            {data.clarity && <ClarityCardView clarity={data.clarity} />}
            <div ref={endRef} />
          </div>
        </div>

        <div className="border-t border-line bg-bg/80 px-4 pb-4 pt-3 backdrop-blur sm:px-6">
          <div className="mx-auto max-w-2xl">
            <Composer onSend={send} disabled={busy} initial={draft} autoFocus />
            <p className="mt-2 text-center text-[11px] text-muted">
              StudentGPT is an AI mentor, not a therapist. <Link to="/safety" className="underline">Safety & support</Link>
            </p>
          </div>
        </div>
      </div>

      {panel && (
        <aside className="fixed inset-y-0 right-0 z-40 w-[min(22rem,90vw)] overflow-y-auto border-l border-line bg-surface p-5 shadow-lift lg:static lg:z-auto lg:shadow-none">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-serif text-lg">What we've explored</h2>
            <button className="rounded-md p-1 text-muted hover:bg-sunken" onClick={() => setPanel(false)} aria-label="Close panel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <ExploredPanel explored={data.explored} />
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- new conversation
function Welcome({ onStart, starting }: { onStart: (text: string) => void; starting: boolean }) {
  const { data } = useSession();
  const name = data?.user?.display_name;
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-10 sm:px-6">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-reflect-soft text-reflect">
          <Sparkles className="h-5 w-5" />
        </div>
        <h1 className="mt-5 text-center font-serif text-3xl sm:text-4xl">
          {name ? `What's on your mind, ${name}?` : "What's on your mind?"}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-center text-muted">
          Say it however it comes out. StudentGPT will ask questions to help you see what's underneath, not rush to
          advice.
        </p>
        <div className="mt-8">
          {starting ? (
            <div className="grid place-items-center py-6">
              <Spinner label="Starting your reflection" />
            </div>
          ) : (
            <Composer onSend={onStart} autoFocus />
          )}
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {REFLECT_STARTERS.map((s) => (
            <button
              key={s}
              disabled={starting}
              onClick={() => onStart(s)}
              className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-muted transition-colors hover:border-reflect/40 hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReflectPage() {
  const { conversationId } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const ensureSession = useEnsureSession();
  const qc = useQueryClient();
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const autoStarted = useRef(false);
  const pending = (location.state as { pending?: string } | null)?.pending;

  const start = useCallback(
    async (text: string) => {
      setStarting(true);
      try {
        await ensureSession();
        const conv = await api<Conversation>('/api/studentgpt/conversations', { body: {} });
        qc.invalidateQueries({ queryKey: LIST_KEY });
        navigate(`/reflect/${conv.id}`, { replace: true, state: { pending: text } });
      } catch (e) {
        toast(errorMessage(e), 'error');
      } finally {
        setStarting(false);
      }
    },
    [ensureSession, navigate, qc, toast],
  );

  useEffect(() => {
    const s = params.get('start');
    if (s && !conversationId && !autoStarted.current) {
      autoStarted.current = true;
      setParams({}, { replace: true });
      start(s);
    }
  }, [params, conversationId, setParams, start]);

  return (
    <PageShell footer={false}>
      <div className="flex h-[calc(100dvh-4rem)]">
        <aside className="hidden w-72 shrink-0 border-r border-line bg-surface/60 md:block">
          <ConversationList activeId={conversationId} />
        </aside>
        {drawer && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-ink/30" onClick={() => setDrawer(false)} />
            <aside className="absolute inset-y-0 left-0 w-[min(20rem,85vw)] bg-surface shadow-lift animate-fade-up">
              <ConversationList activeId={conversationId} onPick={() => setDrawer(false)} />
            </aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 md:hidden">
            <Button size="sm" variant="ghost" onClick={() => setDrawer(true)}>
              <PanelLeft className="h-4 w-4" /> Conversations
            </Button>
          </div>
          {conversationId ? (
            <ConversationView key={conversationId} id={conversationId} pending={pending} />
          ) : (
            <Welcome onStart={start} starting={starting} />
          )}
        </div>
      </div>
    </PageShell>
  );
}
