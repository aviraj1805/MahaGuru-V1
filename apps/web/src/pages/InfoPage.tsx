import { PageShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/primitives';

const HELPLINES = [
  ['Tele-MANAS (Govt. of India, free, 24x7)', '14416 or 1-800-891-4416', 'tel:14416'],
  ['iCall (TISS) psychosocial helpline', '9152987821 (Mon-Sat, 10am-8pm)', 'tel:+919152987821'],
  ['Emergency services (India)', '112', 'tel:112'],
  ['Outside India', 'findahelpline.com', 'https://findahelpline.com'],
];

export default function InfoPage({ page }: { page: 'safety' | 'privacy' }) {
  return (
    <PageShell>
      <article className="container-page max-w-3xl py-12 sm:py-16">
        {page === 'safety' ? (
          <>
            <p className="eyebrow">Safety & support</p>
            <h1 className="mt-3 font-serif text-4xl">StudentGPT is a mentor, not a therapist</h1>
            <div className="mt-6 space-y-4 leading-relaxed text-muted">
              <p>
                StudentGPT helps you reflect: it asks questions so you can understand your own thinking. It does not
                diagnose, treat or replace a qualified counsellor, psychologist or doctor.
              </p>
              <p>
                If a conversation suggests you may be in danger or in serious distress, StudentGPT pauses the reflection,
                checks whether you are safe and shows the helplines below. It also encourages you to talk to someone you
                trust. If you have felt low for weeks, struggle to sleep or eat, or have panic attacks, please speak to a
                professional alongside using StudentGPT. Your college counselling centre is a good first step.
              </p>
            </div>
            <Card className="mt-8 divide-y divide-line">
              {HELPLINES.map(([name, contact, href]) => (
                <a key={name} href={href} className="flex flex-col gap-0.5 p-4 hover:bg-sunken sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium">{name}</span>
                  <span className="text-brand">{contact}</span>
                </a>
              ))}
            </Card>
            <p className="mt-4 text-xs text-muted">If you are in immediate danger, call 112 now.</p>
          </>
        ) : (
          <>
            <p className="eyebrow">Privacy</p>
            <h1 className="mt-3 font-serif text-4xl">Your data, plainly explained</h1>
            <div className="mt-6 space-y-4 leading-relaxed text-muted">
              <p>
                <strong className="text-ink">What we store.</strong> Your account email and an encrypted (hashed) password;
                your StudentGPT conversations and the private notes the mentor keeps to stay coherent; your classrooms,
                lessons, quiz answers and progress; and a count of AI actions for daily limits.
              </p>
              <p>
                <strong className="text-ink">Who processes it.</strong> To generate replies, the relevant parts of your
                conversation are sent to the AI provider configured by the site operator (by default Google's Gemini API).
                Read the provider's terms for how they handle API data. We do not sell your data or show ads.
              </p>
              <p>
                <strong className="text-ink">Safety records.</strong> If a safety protocol is triggered we record that it
                happened and its category, not your message text.
              </p>
              <p>
                <strong className="text-ink">Your control.</strong> You can delete any conversation or classroom at any time,
                and delete your whole account and all its data from the Account page. Guest data expires with the guest
                session.
              </p>
              <p>
                <strong className="text-ink">Who it's for.</strong> MahaGuru is intended for students aged 18 and above.
              </p>
            </div>
          </>
        )}
      </article>
    </PageShell>
  );
}
