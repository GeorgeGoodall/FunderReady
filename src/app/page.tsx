import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FunderReady — AI bid review for UK charities",
  description:
    "FunderReady reviews your answers against the funder's real criteria, so you know exactly where you stand before you submit.",
};

const BETA_MAILTO =
  "mailto:hello@funderready.com?subject=Beta%20access%20request%20%E2%80%94%20FunderReady&body=Hi%20FunderReady%20team%2C%0A%0AI%27d%20like%20to%20request%20beta%20access.%0A%0AName%3A%20%5Byour%20name%5D%0AOrganisation%20(if%20applicable)%3A%20%5Bname%5D%0ARole%3A%20%5Be.g.%20Grants%20Manager%2C%20Fundraiser%2C%20freelance%20bid%20writer%5D%0AHow%20I%20heard%20about%20FunderReady%3A%20%5Boptional%5D%0A%0AThanks";

// ─── Social proof config ─────────────────────────────────────────────────────
// Set values here to enable the social proof section.
// quote and fundNames render independently — either can be set without the other.
const SOCIAL_PROOF = {
  quote: null as string | null,
  // e.g. "FunderReady showed us exactly where our financial case was falling short."
  quoteAuthor: null as string | null,
  // e.g. "Sarah J., Grants Manager at Southwark Community Trust"
  fundNames: null as string[] | null,
  // e.g. ["National Lottery Community Fund", "Comic Relief", "The National Lottery Heritage Fund"]
};

const FAQ_ITEMS = [
  {
    q: "Is my application data private and secure?",
    a: "Yes. Your answers are stored securely and only ever used to generate your review. We never share your application data with funders or third parties. See our Privacy Policy for full details.",
  },
  {
    q: "How accurate is the AI feedback?",
    a: "FunderReady reviews your answers against the specific criteria published by each funder. It identifies gaps, weak evidence, and missing elements. Like any AI tool, it works best alongside your own judgement — think of it as a rigorous second pair of eyes, not a guarantee of success.",
  },
  {
    q: "What funds are already in the library?",
    a: "The library is growing. We're adding major UK grant-makers during beta — request beta access to see what's available and to suggest funds you'd like added.",
  },
  {
    q: "Can I add a fund that isn't listed?",
    a: "Yes. If your fund isn't in the library, you can add its criteria and questions yourself. Once reviewed by the FunderReady team, it becomes available for the whole community.",
  },
  {
    q: "What does beta access include?",
    a: "Beta users get full access to all features — unlimited applications, AI reviews, and the community fund library — at no cost while we're in beta.",
  },
];

export default function Home() {
  const showSocialProof =
    SOCIAL_PROOF.quote !== null || SOCIAL_PROOF.fundNames !== null;

  return (
    <div className="min-h-screen">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-slate-800 bg-slate-900 px-6 md:px-10">
        <span className="text-sm font-bold tracking-tight text-slate-50">
          FunderReady
        </span>
        <Link
          href="/login"
          className="rounded-lg border border-slate-700 px-4 py-1.5 text-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
        >
          Sign in
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="bg-slate-900 px-6 py-24 text-center md:px-10 md:py-32">
        <div className="mx-auto max-w-2xl">
          <span className="mb-6 inline-block rounded-full border border-slate-700 bg-slate-800 px-4 py-1.5 text-xs text-slate-400">
            Built for UK charities and social enterprises
          </span>
          <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-slate-50 md:text-5xl lg:text-6xl">
            Submit your next bid
            <br className="hidden sm:block" /> knowing it&apos;s ready
          </h1>
          <p className="mb-10 text-lg text-slate-400 md:text-xl">
            FunderReady reviews your answers against the funder&apos;s real
            criteria, so you know exactly where you stand before you submit.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={BETA_MAILTO}
              className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
            >
              Get beta access
            </a>
            <a
              href="#how-it-works"
              className="rounded-lg border border-slate-700 px-6 py-3 text-sm font-medium text-slate-400 transition-colors hover:border-slate-500 hover:text-slate-200"
            >
              See how it works ↓
            </a>
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="bg-white px-6 py-20 md:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
            The problem
          </p>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Writing bids is hard.
            <br />
            Feedback is almost impossible to get.
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="mb-2 text-base font-semibold text-slate-900">
                You never find out why you failed
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                Most funders don&apos;t give feedback. You rewrite from scratch
                next time, making the same mistakes.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
              <h3 className="mb-2 text-base font-semibold text-slate-900">
                No way to know if it&apos;s good enough
              </h3>
              <p className="text-sm leading-relaxed text-slate-500">
                You spend weeks on an application with no way to gauge whether
                your answers are actually hitting the mark.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Bridge ── */}
      <section className="bg-slate-900 px-6 py-20 text-center md:px-10">
        <p className="mx-auto max-w-2xl text-xl font-semibold leading-relaxed text-slate-50 md:text-2xl">
          &ldquo;What if you could get expert-level feedback on every answer,
          before you submit &mdash;{" "}
          <span className="text-blue-400">
            scored against what that funder actually cares about?
          </span>
          &rdquo;
        </p>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="bg-slate-50 px-6 py-20 md:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
            How it works
          </p>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Three steps to a stronger bid
          </h2>
          <div className="divide-y divide-slate-200">
            {[
              {
                n: "1",
                title: "Find your fund",
                body: "Search the community library of funds and criteria sets. If yours isn't listed yet, add it — and help future applicants too.",
              },
              {
                n: "2",
                title: "Write your answers",
                body: "Fill in your answers guided by that fund's real criteria. Word limits are built in — no copy-pasting between documents.",
              },
              {
                n: "3",
                title: "See exactly where you stand",
                body: "Get scores per criterion, inline comments on your text, and clear guidance on where to improve — before you submit.",
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="flex gap-5 py-6">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {n}
                </div>
                <div>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-900">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-500">{body}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ── Review animation ── */}
          <div className="mt-10 overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
            {/* Top bar */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800 px-5 py-3">
              <span className="truncate text-xs font-semibold text-slate-200">
                National Lottery Community Fund — Application review
              </span>
              <span className="ml-3 shrink-0 text-xs text-blue-400">● Live</span>
            </div>
            {/* Progress */}
            <div className="border-b border-slate-800 px-5 py-4">
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-slate-500">Reviewing your application</span>
                <span className="text-blue-400">In progress</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div className="lp-progress h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400" />
              </div>
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className={`lp-pill-${i} h-1 flex-1 rounded-full`} />
                ))}
              </div>
            </div>
            {/* Tabs */}
            <div className="lp-tabs flex border-b border-slate-800 px-5">
              {["Summary", "Answers", "History"].map((tab, i) => (
                <div
                  key={tab}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-xs font-medium ${
                    i === 0
                      ? "border-blue-600 text-slate-200"
                      : "border-transparent text-slate-500"
                  }`}
                >
                  {tab}
                </div>
              ))}
            </div>
            {/* Score rings */}
            <div className="lp-scores px-5 py-4">
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Criteria scores
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6">
                {(
                  [
                    {
                      label: "Community Impact",
                      pct: 82,
                      color: "#4ade80",
                      ringCls: "lp-ring-1",
                      strokeCls: "lp-ring-1-stroke",
                      numCls: "lp-num-1",
                    },
                    {
                      label: "Financial Case",
                      pct: 61,
                      color: "#fcd34d",
                      ringCls: "lp-ring-2",
                      strokeCls: "lp-ring-2-stroke",
                      numCls: "lp-num-2",
                    },
                    {
                      label: "Org. Capacity",
                      pct: 74,
                      color: "#bef264",
                      ringCls: "lp-ring-3",
                      strokeCls: "lp-ring-3-stroke",
                      numCls: "lp-num-3",
                    },
                    {
                      label: "Sustainability",
                      pct: 88,
                      color: "#34d399",
                      ringCls: "lp-ring-4",
                      strokeCls: "lp-ring-4-stroke",
                      numCls: "lp-num-4",
                    },
                  ] as const
                ).map(({ label, pct, color, ringCls, strokeCls, numCls }) => (
                  <div
                    key={label}
                    className={`${ringCls} flex flex-col items-center gap-2`}
                  >
                    <div className="relative flex items-center justify-center">
                      <svg
                        width="72"
                        height="72"
                        viewBox="0 0 72 72"
                        aria-hidden="true"
                      >
                        <circle
                          cx="36"
                          cy="36"
                          r="28"
                          fill="none"
                          stroke="#1e293b"
                          strokeWidth="6"
                        />
                        <circle
                          cx="36"
                          cy="36"
                          r="28"
                          fill="none"
                          stroke={color}
                          strokeWidth="6"
                          strokeLinecap="round"
                          transform="rotate(-90 36 36)"
                          className={strokeCls}
                        />
                      </svg>
                      <span
                        className={`${numCls} absolute text-sm font-bold`}
                        style={{ color }}
                      >
                        {pct}%
                      </span>
                    </div>
                    <p className="text-center text-xs leading-snug text-slate-400">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            {/* Answer + inline comment */}
            <div className="lp-answer border-t border-slate-800 px-5 py-4">
              <p className="mb-2 text-xs font-semibold text-slate-500">
                Q2 — Describe the community need your project addresses
              </p>
              <p className="text-xs leading-relaxed text-slate-300">
                <span className="lp-highlight">
                  Our project supports over 200 families
                </span>{" "}
                in the Southwark area, providing weekly food parcels, skills
                workshops, and emergency welfare advice to households in crisis.
              </p>
              <div className="lp-comment mt-3 rounded-r-lg border-l-2 border-blue-600 bg-slate-800 py-2 pl-3 pr-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Suggestion
                </p>
                <p className="text-xs leading-relaxed text-slate-400">
                  Strong reach figure.{" "}
                  <strong className="text-slate-300">Add outcome data</strong> —
                  e.g. how many families moved out of crisis in the last 12
                  months. This directly addresses the funder&apos;s
                  &ldquo;demonstrable impact&rdquo; criterion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Differentiators ── */}
      <section className="bg-white px-6 py-20 md:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
            Why FunderReady
          </p>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Not generic AI. Criteria-specific feedback.
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: "🎯",
                title: "Scored against this funder\u2019s priorities",
                body: "Every review is calibrated to the criteria of the specific fund you\u2019re applying to \u2014 not generic \u201Cgood writing\u201D advice.",
              },
              {
                icon: "📈",
                title: "Re-review tracks your improvement",
                body: "Submit a second draft and see exactly how your scores changed. Know whether your rewrites are actually working.",
              },
              {
                icon: "🤝",
                title: "Community fund library",
                body: "If your fund isn\u2019t in the library yet, add it. Every contribution helps the next charity applying to the same funder.",
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="rounded-xl border border-slate-200 p-6">
                <div className="mb-3 text-2xl">{icon}</div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-500">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof (conditional) ── */}
      {showSocialProof && (
        <section className="bg-slate-50 px-6 py-20 md:px-10">
          <div className="mx-auto max-w-3xl">
            <p className="mb-8 text-xs font-semibold uppercase tracking-widest text-blue-600">
              Early users
            </p>
            {SOCIAL_PROOF.quote && (
              <div className="mb-8 rounded-xl bg-slate-900 p-7">
                <p className="mb-4 text-base italic leading-relaxed text-slate-100">
                  &ldquo;{SOCIAL_PROOF.quote}&rdquo;
                </p>
                {SOCIAL_PROOF.quoteAuthor && (
                  <p className="text-sm text-slate-500">
                    {SOCIAL_PROOF.quoteAuthor}
                  </p>
                )}
              </div>
            )}
            {SOCIAL_PROOF.fundNames && SOCIAL_PROOF.fundNames.length > 0 && (
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-600">
                  Funds already in the library
                </p>
                <div className="flex flex-wrap gap-2">
                  {SOCIAL_PROOF.fundNames.map((name) => (
                    <span
                      key={name}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-600"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Secondary CTA ── */}
      <section className="bg-slate-900 px-6 py-20 text-center md:px-10">
        <div className="mx-auto max-w-xl">
          <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-50">
            Ready to see how your answers score?
          </h2>
          <a
            href={BETA_MAILTO}
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Get beta access
          </a>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="bg-white px-6 py-20 md:px-10">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
            FAQ
          </p>
          <h2 className="mb-10 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
            Common questions
          </h2>
          <div className="divide-y divide-slate-200">
            {FAQ_ITEMS.map(({ q, a }) => (
              <div key={q} className="py-6">
                <h3 className="mb-2 text-base font-semibold text-slate-900">{q}</h3>
                <p className="text-sm leading-relaxed text-slate-500">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="bg-slate-900 px-6 py-20 text-center md:px-10">
        <div className="mx-auto max-w-xl">
          <p className="mb-8 text-3xl font-extrabold tracking-tight text-slate-50 md:text-4xl">
            Stop guessing.
            <br />
            <span className="text-blue-400">Start knowing.</span>
          </p>
          <a
            href={BETA_MAILTO}
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Get beta access
          </a>
          <div className="mt-10 flex items-center justify-center gap-6 text-sm text-slate-600">
            <Link
              href="/privacy"
              className="transition-colors hover:text-slate-400"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="transition-colors hover:text-slate-400"
            >
              Terms of Service
            </Link>
            <span>© 2026 FunderReady</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
