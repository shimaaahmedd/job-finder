import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import pdfParse from "pdf-parse";
import { pool } from "../db/connection";
import { deactivateResume, getLatestByLabel, saveResume } from "../db/resumeRepository";
import type { NewResume } from "../types/resume";

const RESUMES_DIR = join(__dirname, "..", "..", "resumes");
const USER_ID = "default";

/**
 * Reads every PDF in resumes/, parses its text, and inserts it as the next
 * version of its label. The previous version (if any) is deactivated so only
 * the newest upload per label counts as active.
 */
export async function loadAndSaveResumes(): Promise<void> {
  const files = await readdir(RESUMES_DIR).catch(() => []);
  const pdfFiles = files.filter((file) => extname(file).toLowerCase() === ".pdf");

  for (const file of pdfFiles) {
    const filePath = join(RESUMES_DIR, file);
    const buffer = await readFile(filePath);
    const { text } = await pdfParse(buffer);

    // Label is the last dash-separated part of the file name, uppercased:
    // "jane-doe-fullstack.pdf" -> "FULLSTACK".
    const stem = basename(file, extname(file));
    const label = stem.split("-").pop()?.toUpperCase() ?? stem.toUpperCase();

    const previous = await getLatestByLabel(USER_ID, label);
    const newResume: NewResume = {
      user_id: USER_ID,
      label,
      version: (previous?.version ?? 0) + 1,
      text: text.trim(),
      file_path: filePath,
      is_active: true,
    };

    const saved = await saveResume(newResume);
    if (previous) {
      await deactivateResume(previous.id);
    }

    console.log(`Saved resume "${label}" v${saved.version} (${saved.text.length} chars)`);
  }
}

if (require.main === module) {
  loadAndSaveResumes()
    .catch((err) => {
      console.error("Failed to load resumes:", err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
