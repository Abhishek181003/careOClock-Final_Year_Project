import { Link } from 'react-router-dom';
import { Sunrise, Sunset, ShieldCheck, HeartPulse, Users, Stethoscope } from 'lucide-react';
import { CONFIG } from '../config';
import { ACCENT_TEXT } from '../lib/accentClasses';

export default function LandingPage() {
  return (
    <div className="bg-paper min-h-screen text-ink">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <span className="font-display font-extrabold text-h3 text-brand-dark">
          {CONFIG.BRAND_NAME}
        </span>
        <nav className="flex items-center gap-4" aria-label="Primary">
          <Link to="/login" className="text-ink-soft hover:text-ink text-base">
            Log in
          </Link>
          <Link
            to="/register"
            className="bg-brand text-white font-display font-semibold rounded-full px-4 py-2 hover:bg-brand-dark transition-colors text-base"
          >
            Create account
          </Link>
        </nav>
      </header>

      <main id="main-content">
        {/* HERO */}
        <section className="max-w-5xl mx-auto px-4 pt-10 pb-16">
          <h1 className="text-display max-w-2xl font-display font-extrabold">
            Two minutes, twice a day. That&apos;s the whole check-in.
          </h1>
          <p className="mt-4 text-body max-w-xl text-ink-soft">
            {CONFIG.BRAND_NAME} isn&apos;t a continuous monitor — it&apos;s a calm morning and evening check-in that learns what is normal for your body, and alerts the moment it isn&apos;t.
          </p>

          <div className="mt-10 grid sm:grid-cols-2 gap-5 max-w-2xl">
            <RhythmCard
              icon={Sunrise}
              accent="dawn"
              time="Morning"
              detail="Before food, activity, or medicine — your resting baseline."
            />
            <RhythmCard
              icon={Sunset}
              accent="dusk"
              time="Evening"
              detail="After the day's activity and medicine — how your body responded."
            />
          </div>

          <Link
            to="/register"
            className="inline-block mt-10 bg-brand text-white font-display font-semibold rounded-full px-7 py-3.5 text-h3 hover:bg-brand-dark transition-colors"
          >
            Start your first check-in
          </Link>
        </section>

        {/* TRUST */}
        <section className="bg-surface border-y border-line">
          <div className="max-w-5xl mx-auto px-4 py-14 grid sm:grid-cols-3 gap-8">
            <TrustPoint
              icon={ShieldCheck}
              title="Consent comes first"
              body="Nothing is shared with a caregiver or doctor without your explicit consent, and you can export or delete your data at any time."
            />
            <TrustPoint
              icon={HeartPulse}
              title="Built for a resting pace"
              body="No pop-ups, no artificial streaks you're punished for missing, and zero wearable lock-in (NFR4)."
            />
            <TrustPoint
              icon={Stethoscope}
              title="Your doctor sees more, not less"
              body="Every alert traces back to one clear cause your doctor can verify in seconds, never an unexplainable black-box score."
            />
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="max-w-5xl mx-auto px-4 py-16">
          <h2 className="text-h1 mb-8 font-display">How it works</h2>
          <ol className="grid sm:grid-cols-4 gap-6">
            <Step n={1} title="Set up once" body="Add basic health details and choose your doctor from our pre-seeded network." />
            <Step n={2} title="Check in twice daily" body="A two-minute form each morning and evening with zero wearable dependency." />
            <Step n={3} title="Get a plain answer" body="A clear status after every check-in in everyday language without clinical jargon." />
            <Step n={4} title="Your circle stays in sync" body="Caregivers see reassuring status. Doctors see prioritized clinical triage." />
          </ol>
        </section>

        {/* ROLES */}
        <section className="bg-brand-light/30">
          <div className="max-w-5xl mx-auto px-4 py-14 grid sm:grid-cols-3 gap-8">
            <RoleCard icon={HeartPulse} title="For you" body="Log how you're feeling without needing to interpret complex medical scores yourself." />
            <RoleCard icon={Users} title="For family" body="Know your loved one is steady each morning and evening without having to ask every day." />
            <RoleCard icon={Stethoscope} title="For your doctor" body="A prioritized, explainable clinical triage queue of patients who need evaluation first." />
          </div>
        </section>
      </main>

      <footer className="max-w-5xl mx-auto px-4 py-10 text-sm text-ink-soft space-y-2">
        <p>{CONFIG.NON_DIAGNOSTIC_DISCLAIMER}</p>
        <p>
          In a medical emergency, contact local emergency services immediately — do not wait for a check-in result.
        </p>
        <p>
          © {new Date().getFullYear()} {CONFIG.BRAND_NAME}. Support: {CONFIG.SUPPORT_PHONE}
        </p>
      </footer>
    </div>
  );
}

function RhythmCard({ icon: Icon, accent, time, detail }) {
  return (
    <div className="rounded-ritual bg-surface shadow-ritual p-5 border border-line">
      <div className={`inline-flex items-center gap-2 ${ACCENT_TEXT[accent]} font-display font-semibold text-h3`}>
        <Icon aria-hidden="true" size={22} />
        {time}
      </div>
      <p className="mt-2 text-ink-soft text-base">{detail}</p>
    </div>
  );
}

function TrustPoint({ icon: Icon, title, body }) {
  return (
    <div>
      <Icon className="text-brand" aria-hidden="true" size={26} />
      <h3 className="text-h3 mt-3 font-display">{title}</h3>
      <p className="mt-1 text-ink-soft text-base">{body}</p>
    </div>
  );
}

function Step({ n, title, body }) {
  return (
    <li className="border-t-2 border-brand pt-3 list-none">
      <span className="text-ink-soft text-sm">Step {n}</span>
      <h3 className="text-h3 mt-1 font-display">{title}</h3>
      <p className="mt-1 text-ink-soft text-base">{body}</p>
    </li>
  );
}

function RoleCard({ icon: Icon, title, body }) {
  return (
    <div className="bg-surface rounded-ritual p-5 shadow-ritual border border-line">
      <Icon className="text-brand-dark" aria-hidden="true" size={24} />
      <h3 className="text-h3 mt-2 font-display">{title}</h3>
      <p className="mt-1 text-ink-soft text-base">{body}</p>
    </div>
  );
}
