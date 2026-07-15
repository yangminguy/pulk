#!/usr/bin/env python
"""embed_bridge — stdin/stdout fastembed bridge for the research-engine.

Reads a JSON job on stdin:
    {"dbPath": "...", "items": [{"refId": "...", "kind": "segment|atom",
                                 "text": "...", "runId": "..."}]}

Computes embeddings with fastembed (multilingual MiniLM, same family the Second
Brain uses), then upserts into <dbPath>:

    CREATE TABLE emb (hash TEXT PRIMARY KEY, kind TEXT, ref_id TEXT,
                      run_id TEXT, vec BLOB)

Dedup key is sha256(text): rows whose hash already exists are skipped (idempotent
re-runs, shared segments across runs). Vectors are stored as raw float32 bytes.

Writes {"embedded": N, "skipped": M} to stdout. Any import/IO failure exits
non-zero with the reason on stderr; the Node adapter's available() probe is what
prevents this bridge from being called when fastembed is missing.
"""

import hashlib
import json
import struct
import sqlite3
import sys

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def to_blob(vec) -> bytes:
    # vec is an iterable of floats (numpy array or list).
    values = [float(x) for x in vec]
    return struct.pack("<%df" % len(values), *values)


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS emb ("
        "hash TEXT PRIMARY KEY, kind TEXT, ref_id TEXT, run_id TEXT, vec BLOB)"
    )
    conn.commit()


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print(json.dumps({"embedded": 0, "skipped": 0}))
        return 0

    job = json.loads(raw)
    db_path = job["dbPath"]
    items = job.get("items", [])
    if not items:
        print(json.dumps({"embedded": 0, "skipped": 0}))
        return 0

    conn = sqlite3.connect(db_path)
    try:
        ensure_schema(conn)

        # Determine which items are new (dedup by sha256(text)).
        pending = []
        skipped = 0
        for it in items:
            text = it.get("text", "") or ""
            if not text.strip():
                skipped += 1
                continue
            h = sha256_text(text)
            row = conn.execute("SELECT 1 FROM emb WHERE hash = ?", (h,)).fetchone()
            if row is not None:
                skipped += 1
                continue
            pending.append((h, it))

        embedded = 0
        if pending:
            from fastembed import TextEmbedding

            model = TextEmbedding(model_name=MODEL_NAME)
            texts = [it.get("text", "") for _, it in pending]
            vectors = list(model.embed(texts))
            for (h, it), vec in zip(pending, vectors):
                conn.execute(
                    "INSERT OR IGNORE INTO emb (hash, kind, ref_id, run_id, vec) "
                    "VALUES (?, ?, ?, ?, ?)",
                    (h, it.get("kind", ""), it.get("refId", ""), it.get("runId", ""), to_blob(vec)),
                )
                embedded += 1
            conn.commit()

        print(json.dumps({"embedded": embedded, "skipped": skipped}))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
