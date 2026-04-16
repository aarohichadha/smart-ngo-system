# Field Nexus

Field Nexus is a React + TypeScript dashboard for coordinating field issues, volunteers, and agent-driven action planning.

## Tech Stack

- Vite
- React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (data storage)
- Vitest + Testing Library
- Playwright (base config included)

## Prerequisites

- Node.js 18+
- One package manager: `npm`, `pnpm`, or `yarn`
- A Supabase project with required tables

## Environment Variables

Create a `.env` file at project root:

```bash
VITE_SUPABASE_URL="https://<your-project>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-anon-key>"
# Optional (not required by client code, but useful for your own scripts)
VITE_SUPABASE_PROJECT_ID="<your-project-id>"
```

## Install

```bash
npm run install:all
```

## Run Locally

```bash
npm run dev:frontend
```

The app runs on `http://localhost:8080`.

## Available Scripts

- `npm run install:all` - Install frontend + backend dependencies
- `npm run dev:frontend` - Start frontend dev server
- `npm run build:frontend` - Build frontend for production
- `npm run test:frontend` - Run frontend tests
- `npm run dev:backend` - Start Node backend server
- `npm run start:backend` - Start backend in normal mode
- `npm run dev:ml` - Start Python ML backend

## Project Routes

- `/` - Dashboard
- `/run` - Run Agents
- `/issues` - Issues
- `/volunteers` - Volunteers
- `/action-plan` - Action Plan
- `/logs` - Agent Logs

## Supabase Tables Used

The UI currently reads/writes these tables:

- `issues`
- `volunteers`
- `agent_runs`
- `profiles`
- `auth_events`

Make sure these tables (and referenced columns) exist before running the app in a new Supabase project.

For auth setup SQL (profiles + login/signup event logging + RLS), run:

```bash
backend/supabase/sql/auth_setup.sql
```

## Testing

Unit tests:

```bash
npm run test:frontend
```

E2E tests (Playwright config present):

```bash
npx playwright test --config frontend/playwright.config.ts
```

## Project Structure

```text
frontend/
  src/            # React app source, UI, pages, services
backend/
  src/server/     # Node backend helpers and WhatsApp pipeline
  supabase/       # Supabase edge functions, SQL, and migrations
ml-backend/      # Python Flask ML/RAG backend
```

## Notes

- Agent pipeline in `frontend/src/agents/orchestrator.ts` is scaffolded with stubs and ready for implementation.
- Dashboard and pages already include demo-data actions to help bootstrap local testing.
