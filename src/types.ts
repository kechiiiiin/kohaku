export type Env = {
  DB: D1Database;
  BUCKET: R2Bucket;
  API_TOKEN?: string; // secret。未設定なら /api/* は 503
  DENYLIST?: string; // secret。改行区切りの公開禁止語（リポジトリには置かない）
};

export type PageRow = {
  id: number;
  slug: string;
  title: string;
  description: string;
  format: "md" | "html";
  body: string;
  body_hash: string;
  source_path: string | null;
  listed: number;
  status: "published" | "deleted" | "pending";
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type AssetRow = {
  page_id: number;
  path: string;
  r2_key: string;
  content_type: string;
  size: number;
  sha256: string;
};

export type Finding = { rule: string; line: number; excerpt: string };
