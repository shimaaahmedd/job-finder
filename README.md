# Job Finder

A job-matching pipeline that pulls LinkedIn postings, filters them through a cheap-to-expensive funnel, and shows only the roles worth applying to, each with the reasoning behind the match.

**Live demo:** [job-finder-khaki.vercel.app](https://job-finder-khaki.vercel.app/) · **Demo video:** [Watch the demo](https://www.youtube.com/watch?v=eSc74FaMTWo)

## Why this exists

Most "AI job applier" projects send every scraped job to an LLM and hope for the best. That is slow, expensive, and hard to trust. Job Finder runs the cheapest, most reliable checks first and only spends LLM calls on jobs that survive them. Every decision is saved, so the filters can be tuned against real data instead of guesses.

I don't want a tool that applies for me. I want one I can trust first. Every match shows the reasoning behind it, its scores, and the exact thresholds it was judged under, so I can check each decision before relying on it. Whether I've applied to a job is stored separately from what the pipeline decided.

## The funnel

```
Discovery (Apify, LinkedIn)
        │
        ▼
Rule gate           deterministic, config-driven, free
        │
        ▼
Semantic matching   embeddings + cosine similarity, near-free
        │
        ▼
LLM reasoning       gpt-4o-mini audits the job; the score is computed in code
        │
        ▼
Postgres            every job saved with its status, scores, and reasons
```

Results from 98 jobs discovered between October 7 and 10, all evaluated under the current pipeline:

| Stage             | Pass condition      | Remaining | Cut (% of jobs entering the stage) |
| ----------------- | ------------------- | --------- | ---------------------------------- |
| Discovered        |                     | 98        |                                    |
| Rule gate         | config-driven rules | 69        | 29 (30%)                           |
| Semantic matching | cosine ≥ 0.5        | 50        | 19 (28%)                           |
| LLM reasoning     | score ≥ 0.8         | 17        | 33 (66%)                           |

49% of discovered jobs were removed before any LLM call, and 17% made it through the whole funnel.

### Stage 1: Rule gate

Pure functions driven by `backend/config/rules.json`, so rules change without touching code. The active rules reject:

- postings that require more than 4 years of experience (the lowest stated requirement, read from the description only)
- "founding engineer" style phrases in the description
- salaries below $70k, when a salary is listed
- internships (title or employment type)

Contract roles are kept. A title-keyword rule for senior roles exists but is switched off, because seniority is judged more accurately in stage 3. This stage covers the hard constraints (numbers, salary, negation) that embeddings cannot enforce.

### Stage 2: Semantic matching

Resumes and job text are embedded with `text-embedding-3-small`. Resume embeddings are stored in Postgres with pgvector, and cosine similarity is computed in application code. Each job is matched against every active resume, and the closest one is recorded as the suggested resume.

### Stage 3: LLM reasoning

`gpt-4o-mini` reads each remaining job alongside the suggested resume and returns a structured audit, validated with Zod: each requirement marked as must-have or nice-to-have and met, partial, or missing; the seniority gap; whether the primary language matches; and any environment mismatches.

The model does not pick the score. The score is **computed in code** from the audit, as a weighted share of requirements met, and then hard caps are applied. Must-haves weigh 3x nice-to-haves, partial matches earn partial credit, and each environment mismatch subtracts a small penalty. The caps:

- two or more seniority levels above the candidate: capped well below the threshold
- two or more must-haves missing, or the wrong primary language: capped below the threshold
- one level above: capped at the threshold, so a stretch job can pass but always ranks below a strong match

The same audit always gives the same score; the audit itself runs at temperature 0. A job that needs far more experience than the candidate has cannot talk its way past the threshold.

## Design: save everything for threshold tuning

Rejected jobs are not thrown away. Each job row stores its status, the stage that rejected it, a rejection reason with details, both scores, and the **exact cosine and LLM thresholds it was judged under**. That makes the funnel auditable and lets thresholds be tuned by looking at what was actually rejected.

Pipeline progress is also saved per job, so a run that crashes partway through resumes where it stopped instead of reprocessing or duplicating jobs.

## Engineering notes

### A years-of-experience rule that matched company history

A posting was rejected for "requiring 100 years of experience." The original parser took the largest number followed by "years" anywhere in the text, so it matched company boilerplate ("for over 100 years…"). It also read ranges like "3-5 years" as 5.

The fix: a number only counts if the same sentence or bullet mentions experience, ranges use their minimum, implausible values (above 15) are ignored, and the gate judges on the lowest stated requirement. The rule is deliberately simple. A section-aware version that ignores "preferred" requirements was drafted but not adopted, because nothing needed it yet.

### Compressed cosine scores

The first semantic threshold was 0.7. Across the 69 recent jobs that reached semantic matching, cosine scores ran from 0.43 to 0.61 with a median of 0.52, so 0.7 would have rejected all of them. With `text-embedding-3-small`, resume-to-job similarity sits in a narrow band, and a cutoff that looks reasonable on paper filters everything.

The threshold is now 0.5, just below the range where relevant jobs start to appear. It is deliberately low: a wrongly rejected job is lost for good, while a wrongly passed job costs one cheap LLM call.

## Cost

Measured from my own runs:

| Part                     | Cost                                                    |
| ------------------------ | ------------------------------------------------------- |
| Discovery (Apify)        | about $0.002 per discovered job                         |
| Embeddings + LLM scoring | about $0.0003 per discovered job                        |
| **Total**                | **about $0.0023 per discovered job** (~$2.30 per 1,000) |

LLM scoring costs about $0.0006 per job it evaluates, but only about half of discovered jobs reach it. Scraping is the main cost.

## Architecture

```
Browser ──► Next.js frontend (Vercel)
                │  API key header
                ▼
          Express API (Railway) ──► Apify (discovery)
                │                └─► OpenAI (embeddings, scoring)
                ▼
          PostgreSQL + pgvector (Neon)
```

- `POST /api/pipeline` takes an explicit discovery flag (scrape new jobs, or only resume jobs already in the database), returns `202 Accepted` immediately, and runs in the background. Concurrent calls join the same in-flight run, so a double click cannot trigger duplicate paid API calls.
- `GET /api/pipeline/status` is polled by the frontend, and the results table refreshes when a run finishes.
- A cooldown blocks repeated discovery runs (`429` with `Retry-After`).
- All `/api` routes require an API key, compared in constant time. Spending limits on the OpenAI and Apify accounts act as the backstop.

**Stack:** TypeScript, Node.js, Express, PostgreSQL, pgvector, Next.js, React, Tailwind, TanStack Query, OpenAI API, Apify.

## Running locally

Requirements: Node 18 or newer (developed on Node 24), PostgreSQL 18 with pgvector.

```bash
# Database
createdb job_finder         # matches the default DATABASE_URL in backend/.env.example

# Backend
cd backend
cp .env.example .env        # set DATABASE_URL, OPENAI_API_KEY, APIFY_TOKEN, API_KEY, FRONTEND_URL
npm install
npm run migrate

# Resumes: put your own PDFs in backend/resumes/ (they are not in the repo), then
npm run load-resumes        # parse the PDFs and store them as text
npm run embed-resumes       # embed them once, before the first pipeline run
npm run dev                 # http://localhost:3000

# Frontend (in a second terminal, from the repo root)
cd frontend
cp .env.example .env.local  # set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_API_KEY
npm install
npm run dev                 # http://localhost:3001
```

`OPENAI_API_KEY` and `API_KEY` must both be set: without `OPENAI_API_KEY` the server fails at startup, and without `API_KEY` every `/api` request fails. The frontend's `NEXT_PUBLIC_API_KEY` must equal the backend's `API_KEY`.

Without embedded resumes, semantic matching has nothing to compare against and jobs stop after the rule gate.

## Known limitations

- Single user, with one shared API key that is visible in the frontend bundle. That is acceptable for a personal tool and is backed by spending limits and the cooldown.
- Run state lives in memory, so it resets on restart and would not work across multiple server instances. Per-job progress is saved in the database, so no data is lost.
- LinkedIn hides external apply URLs for most postings, so the card links to the LinkedIn posting.

## Roadmap

- **Level 1 (shipped):** deployed single-user pipeline and dashboard.
- **Level 2:** authentication and per-user data, a background job queue (BullMQ + Redis), unit tests, and CI.
- **Level 3:** usage tiers and billing, only if there is real usage.
