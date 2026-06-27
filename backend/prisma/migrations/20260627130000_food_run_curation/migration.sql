-- Food Run v2: admin-curated "student-friendly" flag on places. Boosts the
-- studentValue factor + the student_friendly goal in the restaurant decision
-- engine. Not derived from Google/Gemini — set by admins/seed.
ALTER TABLE "places" ADD COLUMN "curated_student_friendly" boolean NOT NULL DEFAULT false;
