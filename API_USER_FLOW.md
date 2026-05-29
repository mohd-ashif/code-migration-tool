# Migration Tool Backend API User Flow

## Overview

This document explains how to use the backend APIs and how the migration flow works.
The backend exposes the following main endpoints:

- `POST /api/parse` — parse an uploaded project or code bundle
- `POST /api/migrate` — enqueue a code migration job
- `GET /api/migrate/:jobId` — check migration job status
- `POST /api/report` — generate or fetch a migration report
- `GET /api/download` — download migrated files as a ZIP

## Environment Setup

1. Copy `.env.example` to `.env` in `packages/backend`
2. Fill values:
   - `NODE_ENV=development`
   - `PORT=4000`
   - `API_KEY=your-api-key-here`
   - `DATABASE_URL=postgresql://user:password@localhost:5432/migrationdb`
   - `REDIS_URL=redis://localhost:6379` (optional)
   - `SUPABASE_URL=https://your-project.supabase.co` (optional)
   - `SUPABASE_KEY=your-supabase-service-role-key` (optional)
   - `OPENAI_API_KEY=sk-xxxxx` (optional)

3. Install dependencies in `packages/backend`:

```bash
cd packages/backend
npm install
```

4. Run database migrations:

```bash
npm run migrate
```

5. Start the backend:

```bash
npm run dev
```

## General Flow

1. Client sends a migration request to `POST /api/migrate`.
2. The backend validates the payload and creates a new migration job.
3. The job is persisted in the `migration_jobs` table if `DATABASE_URL` is configured.
4. The backend emits the job to the in-process migration queue.
5. The migration worker picks up the job and runs the migration logic.
6. When complete, the worker updates job status to `completed` or `failed`.
7. The client polls `GET /api/migrate/:jobId` to read the current job status.
8. If the migration is complete, the client can download output from `GET /api/download?jobId={jobId}`.

## Endpoint Details

### `POST /api/parse`

Used to parse a project before migration. It accepts a file upload and optional metadata.

- Method: `POST`
- Content-Type: `multipart/form-data`
- Fields:
  - `project` — the uploaded project file
  - `metadata` — optional JSON metadata

Example response:

```json
{
  "success": true,
  "data": {
    "framework": "react",
    "files": [/* parsed files */],
    "metadata": {}
  }
}
```

### `POST /api/migrate`

Create a migration job.

- Method: `POST`
- Content-Type: `application/json`
- Body:
  - `projectFiles` — array of `{ path, content }`
  - `targetFramework` — target migration framework (e.g. `react`, `next`, `typescript`)
  - `sourceFramework` — optional source framework to control transformation (auto-detected if omitted)

Supported source → target migrations:
- `angular` → `react`
- `vue` → `react`
- `javascript` → `typescript`
- `react` → `typescript` (JSX → TSX)
- `react` → `next`

If a source framework is not provided, the API will auto-detect it from the uploaded files.

Example request body:

```json
{
  "projectFiles": [
    {
      "path": "src/App.tsx",
      "content": "import React from 'react';\nconst App = () => <div>Hello</div>;\nexport default App;"
    }
  ],
  "targetFramework": "react",
  "sourceFramework": "angular"
}
```

Example response:

```json
{
  "success": true,
  "jobId": "123e4567-e89b-12d3-a456-426614174000",
  "status": "pending"
}
```

### `GET /api/migrate/:jobId`

Check the status of a migration job.

- Method: `GET`
- Path parameter: `jobId`

Example response:

```json
{
  "success": true,
  "job": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "status": "completed",
    "result": {
      "success": true,
      "targetFramework": "react",
      "migratedFiles": [/* output files */],
      "metadata": { "fileCount": 1, "origin": "unknown" }
    },
    "message": null
  }
}
```

### `POST /api/report`

Create or fetch a report for a job.

- Method: `POST`
- Content-Type: `application/json`
- Body:
  - `jobId` — migration job ID
  - `summary` — optional summary text

Example response:

```json
{
  "success": true,
  "report": {
    "jobId": "123e4567-e89b-12d3-a456-426614174000",
    "summary": "Migration report was generated successfully.",
    "timestamp": "2026-05-27T...Z",
    "metrics": {
      "migratedFiles": 1,
      "warnings": [],
      "errors": []
    }
  }
}
```

### `GET /api/download`

Download migrated files as a ZIP.

- Method: `GET`
- Query parameter: `jobId`

Example URL:

```
http://localhost:4000/api/download?jobId=123e4567-e89b-12d3-a456-426614174000
```

#### Postman import request

You can import this endpoint into Postman using the following request JSON:

```json
{
  "info": {
    "name": "Migration Tool Download Endpoint",
    "_postman_id": "9d8c7b6a-5e4f-3d2c-1b0a-9f8e7d6c5b4a",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Download Migration ZIP",
      "request": {
        "method": "GET",
        "header": [
          { "key": "x-api-key", "value": "{{apiKey}}", "type": "text" }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/download?jobId={{jobId}}",
          "host": ["{{baseUrl}}"],
          "path": ["api", "download"],
          "query": [{ "key": "jobId", "value": "{{jobId}}" }]
        }
      }
    }
  ],
  "variable": [
    { "key": "baseUrl", "value": "http://localhost:4000" },
    { "key": "apiKey", "value": "" },
    { "key": "jobId", "value": "" }
  ]
}
```

Set `baseUrl` to your server address, `apiKey` if required, and `jobId` to the migration job returned by `/api/migrate`.

## How the migration worker operates

- The backend imports `src/queues/workers/migration.worker.ts` on startup.
- `POST /api/migrate` emits a job into the in-memory queue.
- The worker listens for new jobs and runs `migrateProject(...)`.
- If the job succeeds, it sets the job status to `completed`.
- If the job fails, it sets the status to `failed` and records the error.

## Recommended user flow

1. Set up `.env` and run the backend.
2. Upload project data to `/api/parse` to inspect the project.
3. Call `/api/migrate` with parsed files and target framework.
4. Poll `/api/migrate/:jobId` until status becomes `completed`.
5. Download final output from `/api/download`.
6. Use `/api/report` to generate a final migration summary.

## Notes

- If `DATABASE_URL` is configured, migration jobs are stored in Postgres.
- If `REDIS_URL` is configured, Redis connection is attempted for caching.
- If `SUPABASE_URL`/`SUPABASE_KEY` is configured, Supabase client is initialized.
- Authentication is enabled when `API_KEY` is set; send `x-api-key` header on each request.
