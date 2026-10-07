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
  cosine_threshold         float,
  llm_threshold            float,
  application_status       varchar NOT NULL DEFAULT 'not_applied',
  applied_at               timestamptz,
  closed_at                timestamptz,
  created_at               timestamptz DEFAULT NOW(),
  updated_at               timestamptz DEFAULT NOW()
);

-- Older databases had a single `threshold` column, only ever written by the
-- semantic stage, so it becomes cosine_threshold.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'threshold'
  ) THEN
    ALTER TABLE jobs RENAME COLUMN threshold TO cosine_threshold;
  END IF;
END $$;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS llm_threshold float;
-- Application tracking (user-set, never written by the pipeline)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_status varchar;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS applied_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at timestamptz;
UPDATE jobs SET application_status = 'not_applied' WHERE application_status IS NULL;
ALTER TABLE jobs ALTER COLUMN application_status SET DEFAULT 'not_applied';
ALTER TABLE jobs ALTER COLUMN application_status SET NOT NULL;
-- created_at/updated_at were `timestamp`; existing values were written by
-- NOW() in the session zone (Europe/Istanbul).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE jobs
      ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'Europe/Istanbul',
      ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'Europe/Istanbul';
  END IF;
END $$;


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
  created_at   timestamptz DEFAULT NOW(),
  updated_at   timestamptz DEFAULT NOW(),
  UNIQUE (user_id, label, version)
);

-- created_at/updated_at were `timestamp`; existing values were written by
-- NOW() in the session zone (Europe/Istanbul).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'resumes' AND column_name = 'created_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE resumes
      ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'Europe/Istanbul',
      ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'Europe/Istanbul';
  END IF;
END $$;


-- Helpful for getActiveResumes(userId) / getLatestByLabel(userId, label).
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes (user_id);
