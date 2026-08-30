---
title: SwiftDrop API
emoji: 🚚
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
short_description: Last-mile logistics API — FastAPI, asyncpg, row-level locking
---

# SwiftDrop — API

FastAPI backend for [SwiftDrop](https://github.com/SMAWAHID/Swiftdrop), a
last-mile logistics platform. Source of truth is the GitHub repo; this Space is
a deployment target assembled by `deploy/huggingface/sync.sh`.

- `GET /health` — liveness probe
- `GET /docs` — interactive API reference
- `POST /api/auth/login` — JWT auth
- `/api/shipments`, `/api/drivers`, `/api/reviews`, `/api/notifications`

Built on a 3NF schema with PL/pgSQL triggers and a materialized revenue view.
Driver assignment uses `SELECT … FOR UPDATE NOWAIT`, so two drivers racing for
the same shipment cannot both win.

## Demo accounts

Password for all of them: `Admin@123`

| Role | Email |
|---|---|
| Admin | `admin@swiftdrop.io` |
| Vendor | `alice@vendor.com` |
| Driver | `bob@driver.com` |

## Configuration

Set as Space secrets: `DATABASE_URL`, `SECRET_KEY`.
Set as Space variables: `CORS_ORIGINS`, `DEBUG`, `DB_POOL_MIN_SIZE`, `DB_POOL_MAX_SIZE`.
