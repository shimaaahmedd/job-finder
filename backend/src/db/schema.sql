-- Schema for the job-finder database.
-- Run with: npm run migrate

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS jobs (
  id                       varchar PRIMARY KEY,
  title                    varchar NOT NULL,
  company_name             varchar NOT NULL,
  location                 varchar,
  description_text         text,
  seniority_level          varchar,
  employment_type          varchar,
  salary                   varchar,
  posted_at                date,
  apply_url                varchar,
  link                     varchar,
  company_website          varchar,
  company_description      text,
  job_poster_profile_url   varchar,
  apply_type               varchar,
  status                   varchar NOT NULL DEFAULT 'new',
  rejection_reason         varchar,
  rejection_details        varchar,
  input_url                varchar,
  source                   varchar,
  cosine_score             float,
  llm_score                float,
  llm_reasoning            text,
  suggested_resume         varchar,
  industries               varchar,
  job_function             varchar,
  applicants_count         integer,
  threshold                float,
  created_at               timestamp DEFAULT NOW(),
  updated_at               timestamp DEFAULT NOW()
);

-- Helpful for getJobsByStatus / clearRejected.
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);

-- user_id defaults to 'default' for the single-user setup today;
-- once this becomes multi-user, real user ids populate the same column.
-- id is a UUID (not the label) so re-uploading a label always creates a new
-- row instead of colliding; (user_id, label, version) is the human-facing key.
CREATE TABLE IF NOT EXISTS resumes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      varchar NOT NULL DEFAULT 'default',
  label        varchar NOT NULL,
  version      integer NOT NULL DEFAULT 1,
  text         text NOT NULL,
  embedding    vector(1536),
  file_path    varchar,
  is_active    boolean DEFAULT true,
  created_at   timestamp DEFAULT NOW(),
  updated_at   timestamp DEFAULT NOW(),
  UNIQUE (user_id, label, version)
);

-- Helpful for getActiveResumes(userId) / getLatestByLabel(userId, label).
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes (user_id);
