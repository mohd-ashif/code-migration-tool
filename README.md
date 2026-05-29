# Code Migration Tool - Backend API

This is the backend service for the **Code Migration Tool**, built with Node.js, Express, and TypeScript. It provides a set of RESTful APIs to parse, transform, and migrate frontend codebases from one framework or language to another using AST (Abstract Syntax Tree) transformations and AI-assisted codemods.

## Features

- **Framework Auto-Detection**: Upload a `.zip` or send JSON, and the backend automatically detects whether it's Angular, Vue, React, or vanilla JS.
- **Background Processing**: Migration jobs are placed in a queue and processed by background workers.
- **AST Codemods**: Reliable structural code transformations using custom-built codemod services.
- **PostgreSQL Persistence**: Jobs and results are persisted in a database to ensure they are available for downloading later.
- **Report Generation**: Automatically generates a migration report with metadata about the transformation.

## Supported Migrations

Currently, the backend supports the following migration paths:
- **Angular** → **React**
- **Vue** → **React**
- **JavaScript** → **TypeScript**
- **React** → **TypeScript**
- **React** → **Next.js**

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (Optional, but recommended for persisting background jobs)
- Redis (Optional, for advanced queuing)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the example environment file and configure your variables:
   ```bash
   cp .env.example .env
   ```
   *Make sure to set your `DATABASE_URL` if you want to use PostgreSQL.*

3. Start the development server:
   ```bash
   npm run dev
   ```
   The server will start on `http://localhost:4000` (or whatever `PORT` you configured).

---

## API Endpoints

A Postman collection is included in the root of this directory (`postman_collection.json`) which you can import to test all endpoints.

### 1. `POST /api/parse`
Upload a `.zip` file of a project or send a JSON payload to parse the project and auto-detect the source framework.

### 2. `POST /api/migrate`
Initiates a new migration job. Returns a `jobId` immediately while the background worker processes the files.
- **Body**: `{ "projectFiles": [...], "targetFramework": "react" }`
- **Note**: The source framework is auto-detected if not provided.

### 3. `GET /api/migrate/:jobId`
Poll the status of a migration job. Returns `pending`, `completed`, or `failed`.

### 4. `GET /api/download?jobId=:jobId`
Download the successfully migrated files as a `.zip` archive.

### 5. `POST /api/report`
Generates a structured report detailing the files transformed and any warnings/errors encountered during the codemod process.

---

## Architecture Overview

- **Controllers**: Handle HTTP requests and input validation (`src/controllers`).
- **Services**: Business logic, including `codemod.service.ts` for handling the actual AST transformations and `job.service.ts` for database persistence.
- **Codemods**: The actual transformation logic is split by framework inside `src/codemods/`.
- **Workers**: Background workers that listen to the `migration.queue` and execute heavy transformation tasks without blocking the main event loop (`src/queues/workers`).

## License
MIT
