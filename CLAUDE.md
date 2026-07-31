# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repo maintains `AGENTS.md` as the canonical dev reference (setup, commands, gotchas, architecture notes). Read it in full before making changes — it is actively kept up to date by the project owner:

@AGENTS.md

## Additional notes not covered in AGENTS.md

- **Workspaces**: `pnpm-workspace.yaml` lists `frontend` and `backend` only — the root `package.json` has no real scripts of its own, always run package scripts with `pnpm --filter <package> <script>` (see AGENTS.md Commands).
- **Manual API smoke tests**: `backend/test/api.http` is a REST Client-style `.http` file with example requests for the auth/usuarios/inmuebles routes — not an automated suite (there is none yet, per AGENTS.md).
- **Frontend routing/state**: `frontend/src/App.tsx` + `react-router-dom` for routes, `frontend/src/lib/AuthContext.tsx` for auth state, `frontend/src/lib/api.ts` for the fetch client (token stored in `localStorage`, auto-attached to requests).
- **Frontend structure**: `components/{auth,layout,profile,ui}/` split by domain vs. generic UI primitives; `hooks/` holds the OTP/Google/account-recovery flow hooks that back the auth pages.
