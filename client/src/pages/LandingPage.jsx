import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Sunrise,
  Sunset,
  ShieldCheck,
  HeartPulse,
  Users,
  Stethoscope,
  ArrowRight,
  Clock,
  Brain,
  Lock,
  Menu,
  X,
  ChevronDown,
  Activity,
  CheckCircle2,
  Star,
} from 'lucide-react';
import { CONFIG } from '../config';
import './LandingPage.css';

/* ──────────────────────────────────────────────────────────
   Custom hooks
   ────────────────────────────────────────────────────────── */

/** Intersection Observer hook for scroll-reveal animations */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return [ref, isVisible];
}

/** Parallax offset hook – returns a CSS transform value based on scroll position */
function useParallax(speed = 0.3) {
  const ref = useRef(null);
  const [offset, setOffset] = useState(0);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const windowH = window.innerHeight;
    // Only compute when the element is near the viewport
    if (rect.bottom >= 0 && rect.top <= windowH) {
      setOffset(rect.top * speed);
    }
  }, [speed]);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  return [ref, offset];
}

/* ──────────────────────────────────────────────────────────
   Landing Page
   ────────────────────────────────────────────────────────── */

export default function LandingPage() {
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [heroParallaxRef, heroOffset] = useParallax(0.35);

  // Navbar scroll effect
  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="bg-paper min-h-screen">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* ─── NAVBAR ─── */}
      <nav
        className={`landing-nav ${navScrolled ? 'landing-nav--scrolled' : 'landing-nav--transparent'}`}
        aria-label="Primary"
      >
        <Link to="/" className="nav-brand">
          Care<span>O</span>Clock
        </Link>

        <button
          className="nav-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        <ul className={`nav-links ${mobileMenuOpen ? 'nav-links--open' : ''}`}>
          <li><a href="#benefits" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Benefits</a></li>
          <li><a href="#how-it-works" className="nav-link" onClick={() => setMobileMenuOpen(false)}>How It Works</a></li>
          <li><a href="#who-its-for" className="nav-link" onClick={() => setMobileMenuOpen(false)}>Who It&apos;s For</a></li>
          <li>
            <Link to="/login" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
              Log in
            </Link>
          </li>
          <li>
            <Link to="/register" className="nav-cta" onClick={() => setMobileMenuOpen(false)}>
              Get Started Free <ArrowRight size={16} />
            </Link>
          </li>
        </ul>
      </nav>

      <main id="main-content">
        {/* ─── HERO ─── */}
        <section className="hero" ref={heroParallaxRef}>
          <div className="hero-bg">
            <img
              src="/assets/images/hero-bg.jpg"
              alt=""
              role="presentation"
              loading="eager"
              style={{ transform: `translateY(${heroOffset}px)` }}
            />
          </div>
          <div className="hero-overlay" />

          <div className="hero-content">
        
            <h1 className="hero-title">
              Your health, checked in <em>two minutes</em> — morning and evening.
            </h1>

            <p className="hero-subtitle">
              CareOClock learns what&apos;s normal for your body and gently alerts the moment
              something changes — no complex devices, no medical jargon, just peace of mind for you
              and your family.
            </p>

            <div className="hero-actions">
              <Link to="/register" className="btn-primary">
                Start Your First Check-in <ArrowRight size={18} />
              </Link>
              <a href="#how-it-works" className="btn-secondary">
                See How It Works <ChevronDown size={18} />
              </a>
            </div>

            <div className="hero-stats">
              <div className="hero-stat">
                <div className="hero-stat-number">2 min</div>
                <div className="hero-stat-label">Per check-in</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-number">2×</div>
                <div className="hero-stat-label">Daily — morning & evening</div>
              </div>
              <div className="hero-stat">
                <div className="hero-stat-number">100%</div>
                <div className="hero-stat-label">Free & open source</div>
              </div>
            </div>
          </div>

          <div className="scroll-indicator" aria-hidden="true">
            <div className="scroll-mouse" />
            <span>Scroll</span>
          </div>
        </section>

        {/* ─── TRUST STRIP ─── */}
        <TrustStrip />

        {/* ─── BENEFITS ─── */}
        <BenefitsSection />

        {/* ─── HOW IT WORKS ─── */}
        <HowItWorksSection />

        {/* ─── PARALLAX IMAGE BAND ─── */}
        <ParallaxBand />

        {/* ─── WHO IT'S FOR ─── */}
        <RolesSection />

        {/* ─── SOCIAL PROOF ─── */}
        <SocialProofSection />

        {/* ─── FINAL CTA ─── */}
        <CTASection />
      </main>

      {/* ─── FOOTER ─── */}
      <LandingFooter />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Section Components
   ────────────────────────────────────────────────────────── */

function TrustStrip() {
  const [ref, visible] = useReveal(0.3);
  return (
    <section
      ref={ref}
      className={`landing-section ${visible ? 'reveal--visible' : ''}`}
      style={{ background: '#fff', padding: '2rem 1.5rem' }}
    >
      <div className="trust-strip" style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}>
        <div className="trust-item">
          <Lock size={20} /> <span>End-to-end encrypted</span>
        </div>
        <div className="trust-item">
          <ShieldCheck size={20} /> <span>Consent-first data policy</span>
        </div>
        <div className="trust-item">
          <Activity size={20} /> <span>AI-powered health insights</span>
        </div>
        <div className="trust-item">
          <CheckCircle2 size={20} /> <span>No wearable required</span>
        </div>
      </div>
    </section>
  );
}

function BenefitsSection() {
  const [ref, visible] = useReveal(0.12);

  const benefits = [
    {
      icon: Clock,
      title: 'Built for a Resting Pace',
      text: 'No pop-ups, no gamified streaks. Just a calm two-minute morning and evening ritual that fits into your existing routine naturally.',
    },
    {
      icon: Brain,
      title: 'AI That Learns You',
      text: 'Our dual-layer intelligence builds a personal baseline over 7 days, then flags meaningful changes — not false alarms — with plain-language explanations.',
    },
    {
      icon: Lock,
      title: 'Your Data, Your Choice',
      text: 'Nothing is shared with a caregiver or doctor without your explicit consent. Export or delete your data anytime. Privacy isn\'t a feature — it\'s a right.',
    },
    {
      icon: Stethoscope,
      title: 'Clinically Transparent',
      text: 'Every alert traces back to one clear cause your doctor can verify in seconds. No unexplainable scores, no black-box guessing.',
    },
    {
      icon: Sunrise,
      title: 'Morning Baseline',
      text: 'Before food, activity, or medicine — capture your resting vitals when your body is at its most neutral and consistent.',
    },
    {
      icon: Sunset,
      title: 'Evening Response',
      text: 'After the day\'s activity and medicine — understand how your body responded and track meaningful patterns over time.',
    },
  ];

  return (
    <section id="benefits" className="landing-section benefits-bg">
      <div className="section-inner">
        <div
          ref={ref}
          className={`reveal ${visible ? 'reveal--visible' : ''}`}
        >
          <div className="section-eyebrow">
            <HeartPulse size={16} /> Why CareOClock
          </div>
          <h2 className="section-title">
            Health monitoring that respects your pace
          </h2>
          <p className="section-subtitle">
            We built CareOClock for people who want peace of mind — not another device demanding attention.
          </p>
        </div>

        <div className={`benefits-grid stagger-children ${visible ? 'stagger-children--visible' : ''}`}>
          {benefits.map((b) => (
            <div key={b.title} className="benefit-card">
              <div className="benefit-icon">
                <b.icon size={24} />
              </div>
              <h3 className="benefit-title">{b.title}</h3>
              <p className="benefit-text">{b.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const [ref, visible] = useReveal(0.12);

  const steps = [
    {
      n: 1,
      title: 'Set Up Once',
      text: 'Add basic health details and choose your doctor from our network. Takes less than five minutes.',
    },
    {
      n: 2,
      title: 'Check In Twice Daily',
      text: 'A simple two-minute form each morning and evening. No wearable needed — just your own observations.',
    },
    {
      n: 3,
      title: 'Get a Plain Answer',
      text: 'A clear health status after every check-in, in everyday language without clinical jargon or confusing numbers.',
    },
    {
      n: 4,
      title: 'Your Circle Stays in Sync',
      text: 'Caregivers see a reassuring daily status. Doctors get a prioritised clinical triage — everyone sees what matters to them.',
    },
  ];

  return (
    <section id="how-it-works" className="landing-section steps-section">
      <div className="section-inner">
        <div
          ref={ref}
          className={`reveal ${visible ? 'reveal--visible' : ''}`}
          style={{ textAlign: 'center', marginBottom: '3rem' }}
        >
          <div className="section-eyebrow" style={{ justifyContent: 'center' }}>
            <Activity size={16} /> Simple by Design
          </div>
          <h2 className="section-title">
            Four steps to peace of mind
          </h2>
          <p className="section-subtitle" style={{ margin: '0 auto 3rem' }}>
            No complicated setup, no learning curve. CareOClock is designed so that anyone —
            regardless of technical ability — can start monitoring in minutes.
          </p>
        </div>

        <div className={`steps-container stagger-children ${visible ? 'stagger-children--visible' : ''}`}>
          {steps.map((s) => (
            <div key={s.n} className="step-item">
              <div className="step-number">{s.n}</div>
              <h3 className="step-title">{s.title}</h3>
              <p className="step-text">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ParallaxBand() {
  const [ref, offset] = useParallax(0.25);

  return (
    <section className="parallax-band" ref={ref}>
      <img
        src="/assets/images/family-care.jpg"
        alt="A family looking at health data on a tablet together"
        loading="lazy"
        style={{ transform: `translateY(${offset}px)` }}
      />
      <div className="parallax-band-overlay">
        <div className="parallax-band-content">
          <h2 className="parallax-band-title">
            Keeping families connected through care
          </h2>
          <p className="parallax-band-text">
            When everyone in the care circle sees the right information at the right time,
            worry turns into confidence.
          </p>
        </div>
      </div>
    </section>
  );
}

function RolesSection() {
  const [ref, visible] = useReveal(0.12);

  const roles = [
    {
      icon: HeartPulse,
      title: 'For You',
      text: 'Log how you\'re feeling in two minutes without needing to interpret complex medical scores yourself. Get clear, everyday-language feedback after every check-in.',
      link: 'Start monitoring →',
    },
    {
      icon: Users,
      title: 'For Your Family',
      text: 'Know your loved one is steady each morning and evening — without having to call and ask every day. A gentle, reassuring view that respects everyone\'s independence.',
      link: 'Join as caregiver →',
    },
    {
      icon: Stethoscope,
      title: 'For Your Doctor',
      text: 'A prioritised, explainable clinical triage queue. Every alert traces back to one clear cause you can verify in seconds — saving time for the patients who need you most.',
      link: 'See doctor dashboard →',
    },
  ];

  return (
    <section id="who-its-for" className="landing-section roles-section">
      <div className="section-inner">
        <div
          ref={ref}
          className={`reveal ${visible ? 'reveal--visible' : ''}`}
          style={{ textAlign: 'center', marginBottom: '3rem' }}
        >
          <div className="section-eyebrow section-eyebrow--light" style={{ justifyContent: 'center' }}>
            <Users size={16} /> Built for Everyone
          </div>
          <h2 className="section-title section-title--light">
            One platform, three perspectives
          </h2>
          <p className="section-subtitle section-subtitle--light" style={{ margin: '0 auto 3rem' }}>
            CareOClock shows each person exactly what they need — patients get clarity,
            families get reassurance, doctors get clinical precision.
          </p>
        </div>

        <div className={`roles-grid stagger-children ${visible ? 'stagger-children--visible' : ''}`}>
          {roles.map((r) => (
            <div key={r.title} className="role-card">
              <div className="role-card-icon">
                <r.icon size={28} />
              </div>
              <h3 className="role-card-title">{r.title}</h3>
              <p className="role-card-text">{r.text}</p>
              <Link to="/register" className="role-card-link">
                {r.link} <ArrowRight size={16} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialProofSection() {
  const [ref, visible] = useReveal(0.12);

  const testimonials = [
    {
      quote: 'My mother lives alone 200km away. Before CareOClock, I used to call her twice a day just to ask if she\'s okay. Now I open the app and see her morning status — green, stable. It changed both our days.',
      name: 'Priya Sharma',
      role: 'Caregiver (Daughter)',
      initials: 'PS',
    },
    {
      quote: 'I was sceptical about another health app, but this one is different. It doesn\'t buzz me constantly or make me feel guilty. Two minutes in the morning, two in the evening, and I know where I stand.',
      name: 'Rajesh Mehta',
      role: 'Patient, 68',
      initials: 'RM',
    },
    {
      quote: 'The triage queue saves me at least 20 minutes each morning. Instead of going through every patient\'s notes, I see exactly who needs evaluation first — and I can verify the reasoning instantly.',
      name: 'Dr. Ananya Rao',
      role: 'General Physician',
      initials: 'AR',
    },
  ];

  return (
    <section className="landing-section social-proof-section">
      <div className="section-inner">
        <div
          ref={ref}
          className={`reveal ${visible ? 'reveal--visible' : ''}`}
          style={{ textAlign: 'center', marginBottom: '3rem' }}
        >
          <div className="section-eyebrow" style={{ justifyContent: 'center' }}>
            <Star size={16} /> What People Say
          </div>
          <h2 className="section-title">
            Trusted by families and physicians
          </h2>
          <p className="section-subtitle" style={{ margin: '0 auto 3rem' }}>
            Real stories from patients, caregivers, and doctors who use CareOClock every day.
          </p>
        </div>

        <div className={`testimonials-grid stagger-children ${visible ? 'stagger-children--visible' : ''}`}>
          {testimonials.map((t) => (
            <div key={t.name} className="testimonial-card">
              <p className="testimonial-quote">{t.quote}</p>
              <div className="testimonial-author">
                <div className="testimonial-avatar">{t.initials}</div>
                <div>
                  <div className="testimonial-name">{t.name}</div>
                  <div className="testimonial-role">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  const [ref, visible] = useReveal(0.2);

  return (
    <section className="landing-section cta-section">
      <div className="section-inner cta-inner" ref={ref}>
        <div className={`reveal ${visible ? 'reveal--visible' : ''}`}>
          <h2 className="cta-title">
            Peace of mind starts with a single check-in
          </h2>
          <p className="cta-subtitle">
            Join CareOClock today — it&apos;s completely free, takes two minutes to set up,
            and requires no special equipment.
          </p>
          <div className="cta-buttons">
            <Link to="/register" className="btn-primary">
              Create Your Free Account <ArrowRight size={18} />
            </Link>
            <Link to="/login" className="btn-secondary">
              Already have an account? Log in
            </Link>
          </div>
          <p className="cta-disclaimer">
            {CONFIG.NON_DIAGNOSTIC_DISCLAIMER} In a medical emergency, contact local emergency services
            immediately — do not wait for a check-in result.
          </p>
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="footer-inner">
        <div className="footer-top">
          <div>
            <div className="footer-brand">
              Care<span>O</span>Clock
            </div>
            <p className="footer-desc">
              A calm, twice-daily health check-in that learns what&apos;s normal for your body
              and alerts the moment it isn&apos;t. Built with care, for care.
            </p>
          </div>

          <div className="footer-col">
            <div className="footer-col-title">Product</div>
            <a href="#benefits">Benefits</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#who-its-for">Who It&apos;s For</a>
          </div>

          <div className="footer-col">
            <div className="footer-col-title">Account</div>
            <Link to="/register">Create Account</Link>
            <Link to="/login">Log In</Link>
          </div>

          <div className="footer-col">
            <div className="footer-col-title">Support</div>
            <a href={`tel:${CONFIG.SUPPORT_PHONE.replace(/\s/g, '')}`}>
              {CONFIG.SUPPORT_PHONE}
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <span className="footer-legal">
            © {new Date().getFullYear()} {CONFIG.BRAND_NAME}. All rights reserved.
          </span>
          <span className="footer-disclaimer">
            {CONFIG.NON_DIAGNOSTIC_DISCLAIMER}
          </span>
        </div>
      </div>
    </footer>
  );
}
