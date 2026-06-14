# Deployable Web Game Template

This repository is a game-unspecific browser game services template. It provides
the reusable backbone around a game: Firebase auth, player profiles, friends,
presence, global/group/direct chat, and a small admin backoffice.

It intentionally does not create game rooms or implement game rules. Add those
inside your game-specific layer.

## Stack

- Backend: FastAPI, SQLAlchemy, PostgreSQL, Redis, Firebase Admin SDK.
- Frontend: React, Vite, Firebase Web SDK, Zustand.
- Realtime: WebSocket gateway for presence and chat.
- Deployment: Docker Compose for local development and production.

## Quick Start

1. Copy the env template:

   ```bash
   cp .env.example .env
   ```

2. Fill in Firebase Web SDK values and the backend Firebase project/admin email
   in `.env`.

3. Put the Firebase Admin SDK JSON file at the path configured by
   `FIREBASE_ADMIN_CREDENTIALS`, for example:

   ```text
   secrets/firebase-admin.dev.json
   ```

4. Run the stack:

   ```bash
   docker compose up --build
   ```

5. Open:

   - Frontend: `http://localhost:${FRONTEND_PORT}` from `.env`
   - Backend API: `http://localhost:${BACKEND_PORT}` from `.env`
   - Backend docs: `http://localhost:${BACKEND_PORT}/docs` from `.env`
   - Adminer: `http://localhost:${ADMINER_PORT}` from `.env`

## Configuration

All local runtime configuration is in `.env`. Use `.env.example` as the source
of truth for ports, Firebase, Redis, Postgres, chat retention, and backend
session settings.

Secret files under `secrets/` are intentionally ignored by git.

## Validation

```bash
python -m pytest -q
cd frontend && npm install && npm run build
```
