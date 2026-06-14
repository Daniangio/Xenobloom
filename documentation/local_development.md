# Local Development

Run the reusable game services stack locally with Docker and open it from
`localhost`.

## Prerequisites

- Docker Engine with the Compose plugin.
- A Firebase project with email/password auth enabled.
- A Firebase Admin SDK service-account JSON for the backend.

## One-Time Setup

1. Copy the local environment template:

   ```bash
   cp .env.example .env
   ```

2. Fill in the Firebase Web SDK values and backend Firebase values in `.env`.

3. Put the Firebase Admin SDK JSON at the path configured by
   `FIREBASE_ADMIN_CREDENTIALS`, for example:

   ```text
   secrets/firebase-admin.dev.json
   ```

4. Set `FIREBASE_PRIMARY_ADMIN_EMAIL` in `.env` if you want the first admin to
   be auto-promoted after Firebase login.

## Start the Stack

From the repository root:

```bash
docker compose up --build
```

That starts:

- Frontend on `http://localhost:5173`
- Backend on `http://localhost:8000`
- FastAPI docs on `http://localhost:8000/docs`
- Adminer on `http://localhost:8081`
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

## Optional RedisInsight

Start RedisInsight only when needed:

```bash
docker compose --profile ops up -d redisinsight
```

Then open `http://localhost:5540`.

## Common Commands

Start in the background:

```bash
docker compose up --build -d
```

Stop everything:

```bash
docker compose down
```

Reset local database volumes:

```bash
docker compose down -v
```

Run with Redis authentication enabled:

```bash
REDIS_PASSWORD=dev-redis-password \
REDIS_URL=redis://:dev-redis-password@redis:6379/0 \
docker compose up --build
```

Follow app logs:

```bash
docker compose logs -f backend frontend
```

## Notes

- The root `docker-compose.yml` is the base local stack.
- `docker-compose.override.yml` adds localhost-only database ports and Adminer.
- The frontend uses Vite and connects to `/api` and `/ws` through `VITE_API_URL`
  and `VITE_WS_URL`.
- Game rooms, matchmaking, rules, and game state are intentionally absent from
  this template.
