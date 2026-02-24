# FunderReady

AI-powered bid and tender document review platform. Upload a `.docx` bid, get scored feedback with inline comments and a detailed scorecard.

## How It Works

FunderReady runs a multi-stage AI review pipeline:

1. **Parse** — Extract document structure from `.docx` using mammoth.js
2. **Preflight** — Validate the document is a reviewable bid
3. **Section Analysis** — Evaluate each section against scoring criteria
4. **Cross-Reference** — Check for consistency across sections
5. **Scoring** — Generate traffic-light scores (Strong / Fair / Needs Improvement / Missing)
6. **Document Generation** — Produce a Word document with inline comments and scorecard

## Tech Stack

- **Framework:** Next.js 16 (React 19, App Router)
- **Styling:** Tailwind CSS v4
- **Database & Auth:** Supabase
- **Background Jobs:** Inngest
- **AI:** Anthropic Claude (multi-stage pipeline with Zod schema validation)
- **Doc Parsing:** mammoth.js (3-tier heading fallback)
- **Doc Generation:** docx.js v9+ (scorecard tables, native Word comments)
- **Testing:** Vitest
- **Language:** TypeScript (strict mode)

## Project Structure

```
app/                      # Next.js production app (this directory)
  src/
    app/(auth)/           # Login, signup pages
    app/(dashboard)/      # Protected dashboard pages
    app/api/inngest/      # Inngest serve endpoint
    components/           # Shared React components
    lib/supabase/         # Supabase clients (server + browser)
    lib/inngest/          # Inngest client
    lib/auth/             # Auth utilities
    types/                # Generated Supabase types
    proxy.ts              # Auth proxy (session refresh + redirects)
  supabase/migrations/    # SQL migrations
Scoping/                  # Product spec & implementation plan
prototypes/               # Validated prototypes (docx, end-to-end, inngest)
ExampleBids/              # Test bid documents
```

## Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project (with tables and RLS policies from `supabase/migrations/`)
- Inngest dev server (for local background job testing)

### Setup

```bash
cd app
npm install
cp .env.local.example .env.local   # Fill in Supabase + Inngest keys
```

### Development

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm test             # Run all tests
npm run test:watch   # Watch mode
```

## Database

Hosted on Supabase with the following tables:

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles (auto-created on signup), subscription tier |
| `reviews` | Review jobs with status tracking and file paths |
| `review_results` | Pipeline output (JSONB) split from reviews for fast listing |
| `usage` | Monthly review counts with bonus tracking |
| `review_purchases` | Pay-per-review audit trail |

Storage buckets: `bid-uploads` (10 MB limit), `review-outputs`

## Implementation Status

- **Phase 0 — Scaffolding:** Complete
- **Phase 1 — Auth + Database:** Complete (12 tests passing)
- **Phase 2 — Upload + Criteria:** In progress

See `Scoping/ImplementationPlan.md` for the full roadmap.
