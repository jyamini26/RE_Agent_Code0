import type {
  CreatePropertyInput,
  Property,
  PropertyStatus,
  UpdatePropertyInput,
} from '@reap/shared';
import type { Db } from '../db/index.js';
import { decodeJson, encodeJson, generateId, nowIso } from '../db/index.js';

interface PropertyRow {
  id: string;
  address: string;
  city: string;
  neighborhood: string | null;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lot_size_sqft: number | null;
  year_built: number | null;
  property_type: string;
  status: string;
  listed_at: string;
  description: string | null;
  features: string;
  created_at: string;
  updated_at: string;
}

function toDomain(row: PropertyRow): Property {
  return {
    id: row.id,
    address: row.address,
    city: row.city,
    neighborhood: row.neighborhood,
    price: row.price,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    sqft: row.sqft,
    lotSizeSqft: row.lot_size_sqft,
    yearBuilt: row.year_built,
    propertyType: row.property_type as Property['propertyType'],
    status: row.status as PropertyStatus,
    listedAt: row.listed_at,
    description: row.description,
    features: decodeJson<string[]>(row.features, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PropertyRepository {
  constructor(private readonly db: Db) {}

  list(options: { status?: PropertyStatus; limit: number; offset: number }): {
    items: Property[];
    total: number;
  } {
    const { status, limit, offset } = options;

    const where = status ? 'WHERE status = @status' : '';
    const params = { status, limit, offset };

    const total = this.db
      .prepare<typeof params, { count: number }>(
        `SELECT COUNT(*) AS count FROM properties ${where}`,
      )
      .get(params);

    const rows = this.db
      .prepare<typeof params, PropertyRow>(
        `SELECT * FROM properties ${where}
         ORDER BY listed_at DESC
         LIMIT @limit OFFSET @offset`,
      )
      .all(params);

    return { items: rows.map(toDomain), total: total?.count ?? 0 };
  }

  findById(id: string): Property | null {
    const row = this.db
      .prepare<{ id: string }, PropertyRow>('SELECT * FROM properties WHERE id = @id')
      .get({ id });
    return row ? toDomain(row) : null;
  }

  create(input: CreatePropertyInput): Property {
    const now = nowIso();
    const property: Property = {
      id: generateId('prop'),
      address: input.address,
      city: input.city,
      neighborhood: input.neighborhood ?? null,
      price: input.price,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      sqft: input.sqft,
      lotSizeSqft: input.lotSizeSqft ?? null,
      yearBuilt: input.yearBuilt ?? null,
      propertyType: input.propertyType,
      status: input.status ?? 'listed',
      listedAt: input.listedAt ?? now,
      description: input.description ?? null,
      features: input.features ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.db
      .prepare(
        `INSERT INTO properties (
           id, address, city, neighborhood, price, bedrooms, bathrooms, sqft,
           lot_size_sqft, year_built, property_type, status, listed_at,
           description, features, created_at, updated_at
         ) VALUES (
           @id, @address, @city, @neighborhood, @price, @bedrooms, @bathrooms, @sqft,
           @lotSizeSqft, @yearBuilt, @propertyType, @status, @listedAt,
           @description, @features, @createdAt, @updatedAt
         )`,
      )
      .run({ ...property, features: encodeJson(property.features) });

    return property;
  }

  update(id: string, patch: UpdatePropertyInput): Property | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const merged: Property = {
      ...existing,
      ...Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined),
      ),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
    };

    this.db
      .prepare(
        `UPDATE properties SET
           address = @address, city = @city, neighborhood = @neighborhood,
           price = @price, bedrooms = @bedrooms, bathrooms = @bathrooms,
           sqft = @sqft, lot_size_sqft = @lotSizeSqft, year_built = @yearBuilt,
           property_type = @propertyType, status = @status, listed_at = @listedAt,
           description = @description, features = @features, updated_at = @updatedAt
         WHERE id = @id`,
      )
      .run({ ...merged, features: encodeJson(merged.features) });

    return merged;
  }

  count(): number {
    const row = this.db
      .prepare<[], { count: number }>('SELECT COUNT(*) AS count FROM properties')
      .get();
    return row?.count ?? 0;
  }
}
