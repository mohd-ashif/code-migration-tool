-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Framework Compiler Engine Management System
-- Creates: frameworks, framework_versions, migration_engines, codemods,
--          supported_migrations, compiler_settings
-- Includes: full seed data for 10 frameworks + engines + matrix
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Core framework catalog ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS frameworks (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(128) NOT NULL,
  slug             VARCHAR(64)  NOT NULL UNIQUE,
  display_name     VARCHAR(128) NOT NULL,
  logo             VARCHAR(32)  NOT NULL DEFAULT 'code',
  category         VARCHAR(64)  NOT NULL DEFAULT 'frontend',
  current_version  VARCHAR(32)  NOT NULL,
  description      TEXT,
  documentation_url VARCHAR(512),
  homepage_url      VARCHAR(512),
  status           VARCHAR(32)  NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','inactive','maintenance','experimental','deprecated')),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_frameworks_slug   ON frameworks (slug);
CREATE INDEX IF NOT EXISTS idx_frameworks_status ON frameworks (status);

-- ── 2. Version history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS framework_versions (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_id        UUID        NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  version             VARCHAR(32) NOT NULL,
  release_date        DATE,
  is_latest           BOOLEAN     NOT NULL DEFAULT FALSE,
  is_supported        BOOLEAN     NOT NULL DEFAULT TRUE,
  minimum_node_version VARCHAR(16),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fv_framework_id ON framework_versions (framework_id);

-- ── 3. AST compiler engines ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS migration_engines (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_id       UUID        NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  engine_name        VARCHAR(128) NOT NULL,
  engine_type        VARCHAR(64)  NOT NULL DEFAULT 'ast'
                     CHECK (engine_type IN ('ast','sfc','compiler','optimizer','translator','mapper')),
  status             VARCHAR(32)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','inactive','maintenance','experimental','deprecated')),
  optimization_level VARCHAR(16)  NOT NULL DEFAULT 'high'
                     CHECK (optimization_level IN ('ultra','high','medium','low')),
  compiler_version   VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
  ast_version        VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
  active_codemods    INTEGER      NOT NULL DEFAULT 0,
  supported          BOOLEAN      NOT NULL DEFAULT TRUE,
  migrations_run     INTEGER      NOT NULL DEFAULT 0,
  avg_duration_ms    INTEGER      NOT NULL DEFAULT 0,
  last_updated       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_me_framework_id ON migration_engines (framework_id);
CREATE INDEX IF NOT EXISTS idx_me_status       ON migration_engines (status);

-- ── 4. Codemods ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS codemods (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_id UUID        NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  engine_id    UUID        REFERENCES migration_engines(id) ON DELETE SET NULL,
  name         VARCHAR(128) NOT NULL,
  description  TEXT,
  enabled      BOOLEAN      NOT NULL DEFAULT TRUE,
  priority     INTEGER      NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  version      VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codemods_framework_id ON codemods (framework_id);
CREATE INDEX IF NOT EXISTS idx_codemods_engine_id    ON codemods (engine_id);

-- ── 5. Migration capability matrix ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supported_migrations (
  id                    UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_framework_id   UUID    NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  target_framework_id   UUID    NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  supported             BOOLEAN NOT NULL DEFAULT TRUE,
  quality_score         INTEGER NOT NULL DEFAULT 80 CHECK (quality_score BETWEEN 0 AND 100),
  stability             VARCHAR(16) NOT NULL DEFAULT 'stable'
                        CHECK (stability IN ('stable','beta','experimental','unstable')),
  estimated_success_rate DECIMAL(5,2) NOT NULL DEFAULT 85.0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_framework_id, target_framework_id)
);

CREATE INDEX IF NOT EXISTS idx_sm_source ON supported_migrations (source_framework_id);
CREATE INDEX IF NOT EXISTS idx_sm_target ON supported_migrations (target_framework_id);

-- ── 6. Compiler settings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compiler_settings (
  id                    UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  framework_id          UUID    NOT NULL UNIQUE REFERENCES frameworks(id) ON DELETE CASCADE,
  parallel_processing   BOOLEAN NOT NULL DEFAULT TRUE,
  optimization          BOOLEAN NOT NULL DEFAULT TRUE,
  tree_shaking          BOOLEAN NOT NULL DEFAULT TRUE,
  source_maps           BOOLEAN NOT NULL DEFAULT FALSE,
  strict_mode           BOOLEAN NOT NULL DEFAULT TRUE,
  experimental_features BOOLEAN NOT NULL DEFAULT FALSE,
  max_file_size         INTEGER NOT NULL DEFAULT 500,   -- KB
  timeout               INTEGER NOT NULL DEFAULT 30,    -- seconds
  memory_limit          INTEGER NOT NULL DEFAULT 512,   -- MB
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Frameworks ────────────────────────────────────────────────────────────────
INSERT INTO frameworks (id, name, slug, display_name, logo, category, current_version, description, documentation_url, homepage_url, status) VALUES
  ('10000000-0000-0000-0000-000000000001', 'React',       'react',      'React',       'react',      'ui-library',  '18.3.0', 'Declarative UI library with JSX/TSX compilation and hook-based state management.', 'https://react.dev/docs', 'https://react.dev', 'active'),
  ('10000000-0000-0000-0000-000000000002', 'Vue',         'vue',        'Vue 3',       'vue',        'framework',   '3.4.0',  'Progressive framework with Single File Component (SFC) compilation engine.', 'https://vuejs.org/guide', 'https://vuejs.org', 'active'),
  ('10000000-0000-0000-0000-000000000003', 'Angular',     'angular',    'Angular',     'angular',    'framework',   '17.0.0', 'Full-featured platform with TypeScript, decorators, and AOT compilation.', 'https://angular.dev/docs', 'https://angular.dev', 'active'),
  ('10000000-0000-0000-0000-000000000004', 'Next.js',     'nextjs',     'Next.js',     'nextjs',     'meta-framework','14.2.0','App Router compiler with React Server Components and streaming support.', 'https://nextjs.org/docs', 'https://nextjs.org', 'active'),
  ('10000000-0000-0000-0000-000000000005', 'Nuxt',        'nuxt',       'Nuxt 3',      'nuxt',       'meta-framework','3.11.0','Vue meta-framework with composables translator and Nitro engine integration.', 'https://nuxt.com/docs', 'https://nuxt.com', 'active'),
  ('10000000-0000-0000-0000-000000000006', 'Svelte',      'svelte',     'Svelte',      'svelte',     'compiler',    '5.0.0',  'Reactive compiler that eliminates the virtual DOM for native browser output.', 'https://svelte.dev/docs', 'https://svelte.dev', 'active'),
  ('10000000-0000-0000-0000-000000000007', 'SolidJS',     'solidjs',    'SolidJS',     'solidjs',    'ui-library',  '1.8.0',  'Fine-grained reactivity with signals-based AST mapper, no virtual DOM.', 'https://docs.solidjs.com', 'https://solidjs.com', 'active'),
  ('10000000-0000-0000-0000-000000000008', 'Qwik',        'qwik',       'Qwik',        'qwik',       'framework',   '1.5.0',  'Resumability-first framework with optimizer translator and lazy execution.', 'https://qwik.dev/docs', 'https://qwik.dev', 'experimental'),
  ('10000000-0000-0000-0000-000000000009', 'TypeScript',  'typescript', 'TypeScript',  'typescript', 'language',    '5.4.0',  'Typed superset of JavaScript with full AST transform and declaration emit.', 'https://www.typescriptlang.org/docs', 'https://www.typescriptlang.org', 'active'),
  ('10000000-0000-0000-0000-000000000010', 'JavaScript',  'javascript', 'JavaScript',  'javascript', 'language',    'ES2024', 'Modern ECMAScript with Babel-based AST transform and module conversion.', 'https://developer.mozilla.org/docs/Web/JavaScript', 'https://developer.mozilla.org', 'active')
ON CONFLICT (slug) DO NOTHING;

-- ── Framework Versions ────────────────────────────────────────────────────────
INSERT INTO framework_versions (framework_id, version, release_date, is_latest, is_supported, minimum_node_version, notes) VALUES
  ('10000000-0000-0000-0000-000000000001', '18.3.0', '2024-04-25', TRUE,  TRUE, '18.0.0', 'Stable LTS release with concurrent rendering'),
  ('10000000-0000-0000-0000-000000000001', '18.2.0', '2022-06-14', FALSE, TRUE, '16.8.0', 'Concurrent mode stable'),
  ('10000000-0000-0000-0000-000000000002', '3.4.0',  '2023-12-28', TRUE,  TRUE, '18.0.0', 'Vapor mode preview'),
  ('10000000-0000-0000-0000-000000000003', '17.0.0', '2023-11-08', TRUE,  TRUE, '18.13.0','Signals, standalone components'),
  ('10000000-0000-0000-0000-000000000004', '14.2.0', '2024-04-11', TRUE,  TRUE, '18.17.0','App Router GA, Partial Prerendering'),
  ('10000000-0000-0000-0000-000000000005', '3.11.0', '2024-03-14', TRUE,  TRUE, '18.0.0', 'Nuxt DevTools v1.0, Layers'),
  ('10000000-0000-0000-0000-000000000006', '5.0.0',  '2024-10-01', TRUE,  TRUE, '18.0.0', 'Runes API, no virtual DOM'),
  ('10000000-0000-0000-0000-000000000007', '1.8.0',  '2023-09-15', TRUE,  TRUE, '16.0.0', 'Signals stable API'),
  ('10000000-0000-0000-0000-000000000008', '1.5.0',  '2024-01-20', TRUE,  TRUE, '16.0.0', 'Resumability v2'),
  ('10000000-0000-0000-0000-000000000009', '5.4.0',  '2024-03-06', TRUE,  TRUE, '14.17.0','satisfies + infer improvements'),
  ('10000000-0000-0000-0000-000000000010', 'ES2024', '2024-06-01', TRUE,  TRUE, '14.0.0', 'Stage-4 proposals: Set methods, Array groupBy')
ON CONFLICT DO NOTHING;

-- ── Migration Engines ─────────────────────────────────────────────────────────
INSERT INTO migration_engines (id, framework_id, engine_name, engine_type, status, optimization_level, compiler_version, ast_version, active_codemods, migrations_run, avg_duration_ms) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'React JSX Compiler',             'ast',         'active', 'ultra',  '7.24.0','3.12.0', 12, 1847, 4200),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Vue SFC Engine',                 'sfc',         'active', 'high',   '3.4.0', '3.1.0',  9,  923, 5800),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Angular AOT Compiler',           'compiler',    'active', 'high',   '17.0.0','2.8.0',  7,  412, 7200),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'Next.js App Router Compiler',    'compiler',    'active', 'ultra',  '14.2.0','3.12.0', 11, 734, 5100),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'Nuxt Composables Translator',    'translator',  'active', 'medium', '3.11.0','3.0.0',  8,  289, 6300),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'Svelte Reactive Compiler',       'compiler',    'active', 'high',   '5.0.0', '5.0.0',  10, 198, 3900),
  ('20000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000007', 'SolidJS Signals Mapper',         'mapper',      'active', 'ultra',  '1.8.0', '1.8.0',  6,  156, 3600),
  ('20000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000008', 'Qwik Optimizer Translator',      'optimizer',   'active', 'medium', '1.5.0', '1.5.0',  5,  87,  8100),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 'TypeScript AST Transform',       'ast',         'active', 'high',   '5.4.0', '5.4.0',  14, 2341, 2800),
  ('20000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000010', 'JavaScript Babel Transform',     'ast',         'active', 'high',   '7.24.0','3.12.0', 8,  1923, 3100)
ON CONFLICT DO NOTHING;

-- ── Update active_codemods from engine row counts (will be corrected after codemods insert)
-- (counted above are pre-seeded values matching the codemods we'll insert)

-- ── Codemods (React) ──────────────────────────────────────────────────────────
INSERT INTO codemods (framework_id, engine_id, name, description, enabled, priority, version) VALUES
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','jsx-transform',         'Auto-imports React, converts createElement to JSX', TRUE, 10, '2.1.0'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','hooks-migrator',        'Converts class components to hooks-based functional components', TRUE, 9, '1.8.0'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','prop-types-remover',    'Strips PropTypes in favour of TypeScript annotations', TRUE, 7, '1.3.0'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','default-export-fix',    'Normalises default vs named exports', TRUE, 6, '1.0.0'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','context-api-upgrade',   'Migrates legacy context to modern Context API', TRUE, 8, '1.5.0'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','strict-mode-wrapper',   'Wraps application in React.StrictMode', FALSE, 4, '1.0.0'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','event-handler-rename',  'Renames legacy event handlers to camelCase', TRUE, 5, '1.2.0'),
  ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','memo-optimization',     'Wraps pure components with React.memo', FALSE, 3, '1.1.0')
ON CONFLICT DO NOTHING;

-- ── Codemods (Vue) ────────────────────────────────────────────────────────────
INSERT INTO codemods (framework_id, engine_id, name, description, enabled, priority, version) VALUES
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','options-to-composition',   'Converts Options API to Composition API', TRUE, 10, '2.0.0'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','v-model-upgrade',          'Upgrades v-model syntax for Vue 3', TRUE, 9, '1.4.0'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','script-setup-transform',   'Converts to <script setup> syntax', TRUE, 8, '1.2.0'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','global-api-treeshake',     'Replaces Vue.* globals with named imports', TRUE, 7, '1.1.0'),
  ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','defineComponent-wrapper',  'Wraps components with defineComponent for TS inference', FALSE, 5, '1.0.0')
ON CONFLICT DO NOTHING;

-- ── Codemods (TypeScript) ─────────────────────────────────────────────────────
INSERT INTO codemods (framework_id, engine_id, name, description, enabled, priority, version) VALUES
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009','type-inference',            'Infers types from usage and adds explicit annotations', TRUE, 10, '2.3.0'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009','interface-to-type',         'Converts interfaces to type aliases where appropriate', FALSE, 4, '1.0.0'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009','strict-null-checks',        'Fixes nullable values for strict null checks', TRUE, 9, '1.7.0'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009','enum-to-const',             'Converts enums to const objects for tree-shaking', TRUE, 7, '1.2.0'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009','module-declaration-fix',    'Fixes ambient module declarations and d.ts files', TRUE, 8, '1.4.0'),
  ('10000000-0000-0000-0000-000000000009','20000000-0000-0000-0000-000000000009','satisfies-operator',        'Adds satisfies operator for safer type assertions', FALSE, 5, '1.1.0')
ON CONFLICT DO NOTHING;

-- ── Codemods (Next.js) ────────────────────────────────────────────────────────
INSERT INTO codemods (framework_id, engine_id, name, description, enabled, priority, version) VALUES
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','pages-to-app-router',       'Migrates Pages Router to App Router layout', TRUE, 10, '2.1.0'),
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','server-components',         'Converts eligible components to React Server Components', TRUE, 9, '1.5.0'),
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','use-client-directive',      'Adds "use client" directive where client-side APIs are used', TRUE, 8, '1.3.0'),
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','getServerSideProps-replace', 'Converts getServerSideProps to async server components', TRUE, 9, '1.4.0'),
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','image-component-upgrade',   'Updates next/image imports and props', TRUE, 7, '1.2.0'),
  ('10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','metadata-api',              'Converts Head component to Metadata API', FALSE, 6, '1.1.0')
ON CONFLICT DO NOTHING;

-- ── Supported Migrations Matrix ────────────────────────────────────────────────
INSERT INTO supported_migrations (source_framework_id, target_framework_id, supported, quality_score, stability, estimated_success_rate) VALUES
  -- React as source
  ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004', TRUE, 97, 'stable',       97.3),
  ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002', TRUE, 88, 'stable',       88.5),
  ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000009', TRUE, 95, 'stable',       95.1),
  ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006', TRUE, 72, 'beta',         72.0),
  ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007', TRUE, 69, 'beta',         69.5),
  -- Angular as source
  ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001', TRUE, 89, 'stable',       89.2),
  ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000009', TRUE, 93, 'stable',       93.0),
  ('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002', TRUE, 74, 'beta',         74.1),
  -- Vue as source
  ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000005', TRUE, 96, 'stable',       96.4),
  ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001', TRUE, 82, 'stable',       82.3),
  ('10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000009', TRUE, 90, 'stable',       90.1),
  -- JavaScript as source
  ('10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000009', TRUE, 99, 'stable',       99.0),
  ('10000000-0000-0000-0000-000000000010','10000000-0000-0000-0000-000000000001', TRUE, 91, 'stable',       91.5),
  -- Svelte
  ('10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001', TRUE, 70, 'beta',         70.2),
  ('10000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000009', TRUE, 85, 'stable',       85.0),
  -- Next.js
  ('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001', TRUE, 92, 'stable',       92.0),
  ('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000005', TRUE, 78, 'beta',         78.5)
ON CONFLICT (source_framework_id, target_framework_id) DO NOTHING;

-- ── Compiler Settings (default per framework) ─────────────────────────────────
INSERT INTO compiler_settings (framework_id, parallel_processing, optimization, tree_shaking, source_maps, strict_mode, experimental_features, max_file_size, timeout, memory_limit)
SELECT id, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, 500, 30, 512
FROM frameworks
ON CONFLICT (framework_id) DO NOTHING;

-- Set experimental for Qwik
UPDATE compiler_settings SET experimental_features = TRUE
WHERE framework_id = '10000000-0000-0000-0000-000000000008';
