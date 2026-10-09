import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageShell } from '@/components/layout/AppShell';
import { Alert, Button, Card, Dialog, Input, Label, Spinner, Textarea } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import { SESSION_KEY, useSession } from '@/lib/session';
import type { Session } from '@/lib/types';

function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted">
          {used} / {limit} today
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken">
        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
      </div>
    </div>
  );
}

export default function AccountPage() {
  const { data, isLoading } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const user = data?.user;
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [year, setYear] = useState('');
  const [interests, setInterests] = useState('');
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.display_name ?? '');
    setField(user.profile.field_of_study ?? '');
    setYear(user.profile.year_of_study ?? '');
    setInterests(user.profile.interests ?? '');
  }, [user]);

  if (isLoading)
    return (
      <PageShell>
        <div className="grid place-items-center py-24">
          <Spinner label="Loading account" />
        </div>
      </PageShell>
    );

  if (!user)
    return (
      <PageShell>
        <div className="container-page max-w-xl py-20 text-center">
          <h1 className="font-serif text-3xl">Your account</h1>
          <p className="mt-3 text-muted">You're not signed in yet.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => navigate('/signup')}>Create free account</Button>
            <Button variant="outline" onClick={() => navigate('/login')}>Log in</Button>
          </div>
        </div>
      </PageShell>
    );

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const s = await api<Session>('/api/auth/me', {
        method: 'PATCH',
        body: {
          display_name: name,
          profile: { field_of_study: field || null, year_of_study: year || null, interests: interests || null },
        },
      });
      qc.setQueryData(SESSION_KEY, s);
      toast('Profile saved. Both products will use it to personalise.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      await api('/api/auth/password', { body: { current_password: pw.current, new_password: pw.next } });
      setPw({ current: '', next: '' });
      toast('Password updated. Other devices were signed out.');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setPwBusy(false);
    }
  };

  const deleteAccount = async () => {
    setDeleteErr(null);
    try {
      await api('/api/auth/me', { method: 'DELETE', body: { password: user.is_guest ? null : deletePw } });
      qc.clear();
      await qc.invalidateQueries({ queryKey: SESSION_KEY });
      navigate('/');
    } catch (err) {
      setDeleteErr(errorMessage(err));
    }
  };

  return (
    <PageShell>
      <div className="container-page max-w-3xl py-10 sm:py-14">
        <h1 className="font-serif text-3xl sm:text-4xl">Account</h1>
        {user.is_guest && (
          <Alert className="mt-6" tone="info" title="You're using MahaGuru as a guest">
            Your work is saved in this browser for 7 days.{' '}
            <Link to="/signup" className="font-medium underline">Create a free account</Link> to keep it and get a
            bigger daily allowance.
          </Alert>
        )}

        <Card className="mt-8 p-6">
          <h2 className="font-serif text-xl">About you</h2>
          <p className="mt-1 text-sm text-muted">Optional. StudentGPT and Classroom use this to personalise conversations and lessons.</p>
          <form onSubmit={saveProfile} className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="dn">Name</Label>
              <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label htmlFor="field">Field of study</Label>
              <Input id="field" placeholder="e.g. B.Tech Computer Science" value={field} onChange={(e) => setField(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label htmlFor="year">Year</Label>
              <Input id="year" placeholder="e.g. 3rd year" value={year} onChange={(e) => setYear(e.target.value)} maxLength={60} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="interests">Interests and goals</Label>
              <Textarea id="interests" rows={3} value={interests} onChange={(e) => setInterests(e.target.value)} maxLength={500} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" loading={saving}>Save profile</Button>
            </div>
          </form>
        </Card>

        {data?.usage && (
          <Card className="mt-6 space-y-4 p-6">
            <h2 className="font-serif text-xl">Today's AI allowance</h2>
            <UsageMeter label="StudentGPT messages" used={data.usage.message.used} limit={data.usage.message.limit} />
            <UsageMeter label="Classroom AI actions" used={data.usage.classroom.used} limit={data.usage.classroom.limit} />
            <p className="text-xs text-muted">Allowances reset on a rolling 24-hour basis. MahaGuru runs on free-tier AI.</p>
          </Card>
        )}

        {!user.is_guest && (
          <Card className="mt-6 p-6">
            <h2 className="font-serif text-xl">Password</h2>
            <form onSubmit={changePassword} className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cur">Current password</Label>
                <Input id="cur" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="new">New password</Label>
                <Input id="new" type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" variant="outline" loading={pwBusy} disabled={!pw.current || pw.next.length < 8}>
                  Update password
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="mt-6 border-danger/30 p-6">
          <h2 className="font-serif text-xl">Delete {user.is_guest ? 'guest data' : 'account'}</h2>
          <p className="mt-1 text-sm text-muted">
            Permanently deletes your reflections, classrooms and progress. This cannot be undone.
          </p>
          <Button variant="danger" className="mt-4" onClick={() => setDeleteOpen(true)}>
            Delete everything
          </Button>
        </Card>
      </div>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete everything?" description="All your conversations, classrooms and progress will be permanently removed.">
        {!user.is_guest && (
          <div className="mb-4">
            <Label htmlFor="delpw">Confirm with your password</Label>
            <Input id="delpw" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
          </div>
        )}
        {deleteErr && <Alert tone="danger" className="mb-4">{deleteErr}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" onClick={deleteAccount} disabled={!user.is_guest && !deletePw}>
            Delete permanently
          </Button>
        </div>
      </Dialog>
    </PageShell>
  );
}
