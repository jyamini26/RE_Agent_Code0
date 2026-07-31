import type { DocumentKind, GeneratedDocument } from '@reap/shared';
import type { Db } from '../db/index.js';
import { generateId, nowIso } from '../db/index.js';

interface DocumentRow {
  id: string;
  kind: string;
  filename: string;
  property_id: string | null;
  size_bytes: number;
  created_at: string;
}

function toDomain(row: DocumentRow): GeneratedDocument {
  return {
    id: row.id,
    kind: row.kind as DocumentKind,
    filename: row.filename,
    url: `/documents/${row.filename}`,
    propertyId: row.property_id,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export class DocumentRepository {
  constructor(private readonly db: Db) {}

  create(input: {
    kind: DocumentKind;
    filename: string;
    propertyId: string | null;
    sizeBytes: number;
  }): GeneratedDocument {
    const doc: GeneratedDocument = {
      id: generateId('doc'),
      kind: input.kind,
      filename: input.filename,
      url: `/documents/${input.filename}`,
      propertyId: input.propertyId,
      sizeBytes: input.sizeBytes,
      createdAt: nowIso(),
    };

    this.db
      .prepare(
        `INSERT INTO documents (id, kind, filename, property_id, size_bytes, created_at)
         VALUES (@id, @kind, @filename, @propertyId, @sizeBytes, @createdAt)`,
      )
      .run(doc);

    return doc;
  }

  list(options: { limit: number; offset: number }): {
    items: GeneratedDocument[];
    total: number;
  } {
    const total = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM documents')
      .get();

    const rows = this.db
      .prepare<typeof options, DocumentRow>(
        `SELECT * FROM documents ORDER BY created_at DESC LIMIT @limit OFFSET @offset`,
      )
      .all(options);

    return { items: rows.map(toDomain), total: total?.count ?? 0 };
  }

  findById(id: string): GeneratedDocument | null {
    const row = this.db
      .prepare<{ id: string }, DocumentRow>('SELECT * FROM documents WHERE id = @id')
      .get({ id });
    return row ? toDomain(row) : null;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM documents WHERE id = @id').run({ id });
    return result.changes > 0;
  }
}
