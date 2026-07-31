import type { CreateLeadInput, CreatePropertyInput } from '@reap/shared';
import type { Container } from '../container.js';
import { createContainer } from '../container.js';
import { logger } from '../logger.js';

/**
 * Demo data.
 *
 * Every address, name, and email is invented, and the domains are reserved
 * (example.com / .example) so nothing here can reach a real inbox. Addresses
 * match the ones referenced in the inbox fixtures so the ingestion pipeline has
 * listings to associate messages with.
 */

const DAY_MS = 86_400_000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

const PROPERTIES: CreatePropertyInput[] = [
  {
    address: '418 Aldergrove Lane',
    city: 'Fairhaven',
    neighborhood: 'Aldergrove',
    price: 845_000,
    bedrooms: 4,
    bathrooms: 3,
    sqft: 2_940,
    lotSizeSqft: 8_200,
    yearBuilt: 2016,
    propertyType: 'single_family',
    status: 'listed',
    listedAt: daysAgo(12),
    description:
      'A four-bedroom on a quiet cul-de-sac, built in 2016 and lightly lived in ' +
      'since. Open plan through the main floor, a finished lower level currently ' +
      'used as a studio, and a west-facing garden that gets the evening sun.',
    features: [
      'Finished lower level with separate entrance',
      'Quartz counters and a five-burner gas range',
      'West-facing garden with mature planting',
      'Two-car garage with EV rough-in',
      'Zoned for Aldergrove Elementary',
    ],
  },
  {
    address: '2210 Corbin Street',
    city: 'Fairhaven',
    neighborhood: 'Corbin Heights',
    price: 1_275_000,
    bedrooms: 5,
    bathrooms: 4,
    sqft: 4_110,
    lotSizeSqft: 12_500,
    yearBuilt: 2004,
    propertyType: 'single_family',
    status: 'listed',
    listedAt: daysAgo(5),
    description:
      'Set back from the street behind a mature hedge, this five-bedroom has been ' +
      'thoroughly renovated in the last three years. Double-height entry, a kitchen ' +
      'that opens onto the rear terrace, and a ground-floor bedroom with an ensuite.',
    features: [
      'Renovated kitchen and primary bath, 2023',
      'Ground-floor bedroom with full ensuite',
      'Covered rear terrace with outdoor kitchen',
      'Three-car garage',
      'New roof and HVAC, 2022',
    ],
  },
  {
    address: '77 Merrivale Court',
    city: 'Fairhaven',
    neighborhood: 'Merrivale',
    price: 512_000,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1_320,
    lotSizeSqft: null,
    yearBuilt: 2019,
    propertyType: 'condo',
    status: 'pending',
    listedAt: daysAgo(31),
    description:
      'A corner two-bedroom on the sixth floor with two exposures and a full-width ' +
      'balcony. Building amenities include a gym, a residents lounge, and secure ' +
      'underground parking.',
    features: [
      'Corner unit with dual exposure',
      'Full-width balcony',
      'Deeded parking and storage',
      'Gym and residents lounge',
    ],
  },
  {
    address: '1904 Pelham Row',
    city: 'Northgate',
    neighborhood: 'Pelham',
    price: 689_000,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1_980,
    lotSizeSqft: 5_400,
    yearBuilt: 1968,
    propertyType: 'townhouse',
    status: 'closed',
    listedAt: daysAgo(74),
    description:
      'A three-bedroom townhouse in original condition with good bones and a ' +
      'south-facing rear yard. Sold above asking after eleven days.',
    features: ['South-facing yard', 'Original hardwood throughout', 'Walk to transit'],
  },
];

const LEADS: Array<CreateLeadInput & { propertyAddress?: string }> = [
  {
    name: 'Daniel Okafor',
    email: 'daniel.okafor@example.com',
    phone: '(555) 010-2288',
    side: 'buyer',
    stage: 'qualified',
    temperature: 'hot',
    source: 'Listing portal',
    budgetMin: 700_000,
    budgetMax: 900_000,
    notes: 'Wants a finished lower level. Sensitive to HOA and carrying costs.',
    lastContactAt: daysAgo(1),
    propertyAddress: '418 Aldergrove Lane',
  },
  {
    name: 'Marcus Bell',
    email: 'marcus.bell@example.com',
    phone: '(555) 010-4471',
    side: 'buyer',
    stage: 'showing',
    temperature: 'hot',
    source: 'Open house',
    budgetMin: 1_100_000,
    budgetMax: 1_400_000,
    notes: 'Second viewing scheduled. Relocating for work, needs to close by autumn.',
    lastContactAt: daysAgo(2),
    propertyAddress: '2210 Corbin Street',
  },
  {
    name: 'Helena Vasquez',
    email: 'helena.vasquez@example.com',
    phone: '(555) 010-9930',
    side: 'buyer',
    stage: 'offer',
    temperature: 'hot',
    source: 'Referral',
    budgetMin: 780_000,
    budgetMax: 860_000,
    notes: 'Cash-heavy, inspection contingency only. Represented by her own agent.',
    lastContactAt: daysAgo(1),
    propertyAddress: '418 Aldergrove Lane',
  },
  {
    name: 'Aisling Byrne',
    email: 'aisling.byrne@example.com',
    phone: '(555) 010-6612',
    side: 'seller',
    stage: 'qualified',
    temperature: 'warm',
    source: 'Past client',
    budgetMin: null,
    budgetMax: 950_000,
    notes: 'Listing photos pending. Wants to launch before the spring market.',
    lastContactAt: daysAgo(14),
  },
  {
    name: 'Grant Whitmore',
    email: 'grant.whitmore@example.com',
    phone: '(555) 010-3355',
    side: 'buyer',
    stage: 'closing',
    temperature: 'warm',
    source: 'Referral',
    budgetMin: 600_000,
    budgetMax: 720_000,
    notes: 'Eight days to close. Waiting on the inspection report; getting anxious.',
    lastContactAt: daysAgo(4),
    propertyAddress: '1904 Pelham Row',
  },
  {
    name: 'Tomas Lindqvist',
    email: 'tomas.lindqvist@example.com',
    phone: null,
    side: 'buyer',
    stage: 'new',
    temperature: 'cold',
    source: 'Website form',
    budgetMin: 400_000,
    budgetMax: 550_000,
    notes: 'Early stage, no pre-approval yet.',
    lastContactAt: daysAgo(21),
  },
  {
    name: 'Rosalind Adeyemi',
    email: 'rosalind.adeyemi@example.com',
    phone: '(555) 010-7744',
    side: 'seller',
    stage: 'lost',
    temperature: 'cold',
    source: 'Cold outreach',
    budgetMin: null,
    budgetMax: null,
    notes: 'Chose to relist with the previous agent.',
    lastContactAt: daysAgo(45),
  },
];

/** Inserts the demo dataset. Assumes the tables are empty. */
export function seed(container: Container): void {
  const { properties, leads } = container.repositories;

  const byAddress = new Map<string, string>();
  for (const input of PROPERTIES) {
    const property = properties.create(input);
    byAddress.set(property.address, property.id);
  }

  for (const { propertyAddress, ...input } of LEADS) {
    leads.create({
      ...input,
      propertyId: propertyAddress ? (byAddress.get(propertyAddress) ?? null) : null,
    });
  }

  logger.info(`[seed] ${PROPERTIES.length} properties, ${LEADS.length} leads inserted`);
}

/**
 * Seeds only an empty database.
 *
 * Called on every boot, which is what makes a fresh clone useful immediately
 * while leaving a database someone has been working in untouched.
 */
export function seedIfEmpty(container: Container): boolean {
  const empty =
    container.repositories.properties.count() === 0 &&
    container.repositories.leads.count() === 0;

  if (!empty) return false;

  seed(container);
  return true;
}

// `npm run seed` runs this file directly.
if (process.argv[1]?.includes('seed')) {
  const container = createContainer();

  if (container.repositories.properties.count() > 0) {
    logger.info('[seed] database already contains data; nothing to do');
  } else {
    seed(container);
  }

  container.db.close();
}
