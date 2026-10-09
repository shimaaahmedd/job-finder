/** A row in the `resumes` table. Mirrors schema.sql exactly. */
export interface Resume {
    id: string;
    user_id: string;
    label: string;
    version: number;
    text: string;
    embedding: number[] | null;
    file_path: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

/** Fields needed to insert a new resume row; id/embedding/timestamps are DB-assigned. */
export type NewResume = Pick<
    Resume,
    "user_id" | "label" | "version" | "text" | "file_path" | "is_active"
>;

/** Safe-to-expose resume fields: no text and no embedding. */
export interface ResumeListItem {
    id: string;
    label: string;
    version: number;
    isActive: boolean;
    createdAt: string;
}
