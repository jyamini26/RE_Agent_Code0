import type {
  AgentProfile,
  Comparable,
  DocumentKind,
  GenerateMarketReportInput,
  Property,
} from '@reap/shared';
import {
  daysOnMarket,
  formatDate,
  formatNumber,
  formatPrice,
  formatPricePerSqft,
  formatSqft,
  titleCase,
} from '@reap/shared';
import fs from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import PDFDocument from 'pdfkit';

export interface RenderedDocument {
  filename: string;
  bytes: Buffer;
}

const PAGE_MARGIN = 50;
const RULE_COLOR = '#c9c2b6';
const MUTED = '#5f5a52';

/**
 * Restricts a caller-supplied fragment to characters that cannot escape a
 * directory or shell-quote badly.
 *
 * Filenames here are derived from property addresses, which are user data.
 * The original implementation interpolated them straight into a path.
 */
export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, maxLength)
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return slug || 'document';
}

/**
 * Resolves a filename inside `baseDir`, refusing anything that escapes it.
 *
 * Belt and braces alongside `slugify`: this is the check that holds even if a
 * future caller forgets to slugify, which is exactly how traversal bugs get
 * reintroduced.
 */
export function resolveWithinDirectory(baseDir: string, filename: string): string {
  const base = path.resolve(baseDir);
  const target = path.resolve(base, filename);

  // path.relative gives a leading '..' for anything outside base. The separator
  // check prevents `/data/docs-evil` matching a base of `/data/docs`.
  const relative = path.relative(base, target);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    relative.includes(`..${path.sep}`)
  ) {
    throw new Error(`Refusing to access a path outside ${base}: ${filename}`);
  }

  return target;
}

export class DocumentService {
  private readonly outputDir: string;
  private readonly agent: AgentProfile;

  constructor(options: { outputDir: string; agent: AgentProfile }) {
    this.outputDir = path.resolve(options.outputDir);
    this.agent = options.agent;
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  get directory(): string {
    return this.outputDir;
  }

  /** Writes a rendered document and returns its size on disk. */
  persist(rendered: RenderedDocument): { filepath: string; sizeBytes: number } {
    const filepath = resolveWithinDirectory(this.outputDir, rendered.filename);
    fs.writeFileSync(filepath, rendered.bytes);
    return { filepath, sizeBytes: rendered.bytes.byteLength };
  }

  /** Removes a generated file. Missing files are not an error. */
  remove(filename: string): void {
    const filepath = resolveWithinDirectory(this.outputDir, filename);
    fs.rmSync(filepath, { force: true });
  }

  // -------------------------------------------------------------------------
  // Renderers
  // -------------------------------------------------------------------------

  async renderCma(
    property: Property,
    comparables: Comparable[],
  ): Promise<RenderedDocument> {
    const bytes = await this.render((doc) => {
      this.header(doc, 'Comparative Market Analysis');

      this.sectionTitle(doc, 'Subject property');
      this.keyValues(doc, [
        ['Address', `${property.address}, ${property.city}`],
        ['Neighborhood', property.neighborhood ?? 'n/a'],
        ['Asking price', formatPrice(property.price)],
        ['Configuration', `${property.bedrooms} bed / ${property.bathrooms} bath`],
        ['Interior', formatSqft(property.sqft)],
        ['Price per sq ft', formatPricePerSqft(property.price, property.sqft)],
        ['Days on market', String(daysOnMarket(property))],
        ['Status', titleCase(property.status)],
      ]);

      doc.moveDown(1);
      this.sectionTitle(doc, 'Comparable sales');

      if (comparables.length === 0) {
        doc
          .fontSize(10)
          .fillColor(MUTED)
          .text('No comparable sales were supplied for this analysis.')
          .fillColor('black');
      } else {
        this.comparablesTable(doc, comparables);
      }

      doc.moveDown(1);
      this.sectionTitle(doc, 'Valuation');

      const stats = summarise(property, comparables);
      this.keyValues(doc, [
        ['Comparables analysed', String(comparables.length)],
        ['Average comparable price', formatPrice(stats.averagePrice)],
        ['Median comparable price', formatPrice(stats.medianPrice)],
        ['Average price per sq ft', `${formatPrice(stats.averagePricePerSqft)}/sq ft`],
        [
          'Indicated value',
          `${formatPrice(stats.indicatedValue)} (${formatSqft(property.sqft)} at comparable rate)`,
        ],
        [
          'Variance to asking',
          `${stats.variancePct >= 0 ? '+' : ''}${stats.variancePct.toFixed(1)}%`,
        ],
      ]);

      doc.moveDown(0.8);
      doc
        .fontSize(10)
        .fillColor(MUTED)
        .text(stats.narrative, PAGE_MARGIN, doc.y, { align: 'left', lineGap: 2 })
        .fillColor('black');

      this.footer(doc);
    });

    return {
      filename: `cma-${slugify(property.address)}-${Date.now()}.pdf`,
      bytes,
    };
  }

  async renderBrochure(property: Property): Promise<RenderedDocument> {
    const bytes = await this.render((doc) => {
      doc.moveDown(3);
      doc
        .fontSize(11)
        .fillColor(MUTED)
        .text((property.neighborhood ?? property.city).toUpperCase(), {
          align: 'center',
          characterSpacing: 3,
        });

      doc.moveDown(0.8);
      doc
        .fontSize(26)
        .fillColor('black')
        .font('Helvetica-Bold')
        .text(property.address, { align: 'center' });

      doc.moveDown(0.4);
      doc
        .fontSize(18)
        .font('Helvetica')
        .text(formatPrice(property.price), { align: 'center' });

      doc.moveDown(0.6);
      doc
        .fontSize(11)
        .fillColor(MUTED)
        .text(
          `${property.bedrooms} bed  ·  ${property.bathrooms} bath  ·  ${formatSqft(property.sqft)}`,
          { align: 'center' },
        )
        .fillColor('black');

      doc.moveDown(2);
      this.rule(doc);
      doc.moveDown(1.5);

      if (property.description) {
        this.sectionTitle(doc, 'About this home');
        doc.fontSize(11).font('Helvetica').text(property.description, {
          align: 'left',
          lineGap: 3,
        });
        doc.moveDown(1);
      }

      if (property.features.length > 0) {
        this.sectionTitle(doc, 'Features');
        doc
          .fontSize(11)
          .font('Helvetica')
          .list(property.features, { bulletRadius: 1.6 });
        doc.moveDown(1);
      }

      this.sectionTitle(doc, 'Details');
      this.keyValues(doc, [
        ['Property type', titleCase(property.propertyType)],
        ['Year built', property.yearBuilt ? String(property.yearBuilt) : 'n/a'],
        ['Lot size', property.lotSizeSqft ? formatSqft(property.lotSizeSqft) : 'n/a'],
        ['Price per sq ft', formatPricePerSqft(property.price, property.sqft)],
        ['Status', titleCase(property.status)],
      ]);

      this.footer(doc);
    });

    return {
      filename: `brochure-${slugify(property.address)}-${Date.now()}.pdf`,
      bytes,
    };
  }

  async renderMarketReport(
    input: GenerateMarketReportInput,
  ): Promise<RenderedDocument> {
    const bytes = await this.render((doc) => {
      this.header(doc, `Market Report — ${input.area}`);

      this.sectionTitle(doc, 'Conditions');
      doc
        .fontSize(11)
        .font('Helvetica')
        .text(
          `The ${input.area} market is currently ${titleCase(input.trend).toLowerCase()}, ` +
            `with homes averaging ${formatNumber(input.averageDaysOnMarket)} days on market ` +
            `and ${input.monthsOfInventory.toFixed(1)} months of inventory available.`,
          { lineGap: 3 },
        );

      doc.moveDown(1);
      this.sectionTitle(doc, 'Key metrics');
      this.keyValues(doc, [
        ['Average sale price', formatPrice(input.averagePrice)],
        ['Median sale price', formatPrice(input.medianPrice)],
        ['Active listings', formatNumber(input.activeListings)],
        ['Average days on market', formatNumber(input.averageDaysOnMarket)],
        ['Months of inventory', input.monthsOfInventory.toFixed(1)],
        ['Market condition', titleCase(input.trend)],
      ]);

      doc.moveDown(1);
      this.sectionTitle(doc, 'What this means');
      doc.fontSize(11).font('Helvetica').text(marketNarrative(input), { lineGap: 3 });

      this.footer(doc);
    });

    return {
      filename: `market-report-${slugify(input.area)}-${Date.now()}.pdf`,
      bytes,
    };
  }

  // -------------------------------------------------------------------------
  // Rendering primitives
  // -------------------------------------------------------------------------

  /**
   * Runs a draw callback and resolves the finished PDF as a Buffer.
   *
   * Collecting into memory rather than streaming to disk keeps the write atomic
   * and lets the caller decide where the bytes go, which is what makes the
   * renderers testable without touching the filesystem.
   */
  private render(draw: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
      const chunks: Buffer[] = [];

      const sink = new Writable({
        write(chunk: Buffer, _encoding, callback) {
          chunks.push(chunk);
          callback();
        },
      });

      sink.on('finish', () => resolve(Buffer.concat(chunks)));
      sink.on('error', reject);
      doc.on('error', reject);

      doc.pipe(sink);

      try {
        draw(doc);
        doc.end();
      } catch (error) {
        doc.end();
        reject(error as Error);
      }
    });
  }

  private header(doc: PDFKit.PDFDocument, title: string): void {
    doc.fontSize(20).font('Helvetica-Bold').text(title);
    doc.moveDown(0.3);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(MUTED)
      .text(`Prepared by ${this.agent.name}  ·  ${this.agent.brokerage}`)
      .text(formatDate(new Date().toISOString()))
      .fillColor('black');
    doc.moveDown(0.8);
    this.rule(doc);
    doc.moveDown(1);
  }

  private footer(doc: PDFKit.PDFDocument): void {
    doc.x = PAGE_MARGIN;
    doc.moveDown(1.5);
    this.rule(doc);
    doc.moveDown(0.6);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(MUTED)
      .text(this.agent.name, PAGE_MARGIN, doc.y)
      .text(`${this.agent.brokerage}  ·  ${this.agent.license}`)
      .text(`${this.agent.phone}  ·  ${this.agent.email}`)
      .moveDown(0.5)
      .fontSize(7)
      .text(
        'Prepared for informational purposes. Figures are estimates based on ' +
          'available data and are not an appraisal or a guarantee of value.',
      )
      .fillColor('black');
  }

  private sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
    doc
      .fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('black')
      .text(title, PAGE_MARGIN, doc.y);
    doc.moveDown(0.4);
  }

  private rule(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    doc
      .strokeColor(RULE_COLOR)
      .lineWidth(0.75)
      .moveTo(PAGE_MARGIN, y)
      .lineTo(doc.page.width - PAGE_MARGIN, y)
      .stroke()
      .strokeColor('black');
    doc.y = y + 2;
  }

  private keyValues(doc: PDFKit.PDFDocument, rows: [string, string][]): void {
    const labelWidth = 160;
    doc.fontSize(10).font('Helvetica');

    for (const [label, value] of rows) {
      const y = doc.y;
      doc.fillColor(MUTED).text(label, PAGE_MARGIN, y, { width: labelWidth });
      doc.fillColor('black').text(value, PAGE_MARGIN + labelWidth, y, {
        width: doc.page.width - PAGE_MARGIN * 2 - labelWidth,
      });
      doc.moveDown(0.25);
    }

    // Positioning text with an explicit x leaves the cursor in the value
    // column. Anything drawn afterwards would inherit that indent, so the
    // cursor is returned to the left margin before handing control back.
    doc.x = PAGE_MARGIN;
    doc.fillColor('black');
  }

  private comparablesTable(doc: PDFKit.PDFDocument, comparables: Comparable[]): void {
    const columns: [string, number][] = [
      ['Address', 200],
      ['Price', 90],
      ['Bed/Bath', 70],
      ['Sq ft', 60],
      ['$/sq ft', 70],
    ];

    let y = doc.y;
    doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);

    let x = PAGE_MARGIN;
    for (const [heading, width] of columns) {
      doc.text(heading, x, y, { width });
      x += width;
    }

    doc.y = y + 14;
    this.rule(doc);
    doc.moveDown(0.3);

    doc.font('Helvetica').fillColor('black');

    for (const comp of comparables) {
      // Start a new page before a row would be clipped by the bottom margin.
      if (doc.y > doc.page.height - PAGE_MARGIN - 60) {
        doc.addPage();
      }

      y = doc.y;
      x = PAGE_MARGIN;

      const cells = [
        comp.address,
        formatPrice(comp.price),
        `${comp.bedrooms}/${comp.bathrooms}`,
        formatNumber(comp.sqft),
        formatPricePerSqft(comp.price, comp.sqft).replace('/sq ft', ''),
      ];

      cells.forEach((cell, index) => {
        const width = columns[index]?.[1] ?? 80;
        doc.text(cell, x, y, { width, ellipsis: true, lineBreak: false });
        x += width;
      });

      doc.y = y + 14;
    }

    doc.x = PAGE_MARGIN;
  }
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface CmaStats {
  averagePrice: number;
  medianPrice: number;
  averagePricePerSqft: number;
  indicatedValue: number;
  variancePct: number;
  narrative: string;
}

/**
 * Derives the valuation figures printed on a CMA.
 *
 * Exported and pure so the arithmetic is unit-tested directly rather than by
 * inspecting a rendered PDF. Falls back to the asking price when no
 * comparables are supplied, which keeps variance at zero rather than dividing
 * by an empty set.
 */
export function summarise(property: Property, comparables: Comparable[]): CmaStats {
  if (comparables.length === 0) {
    return {
      averagePrice: property.price,
      medianPrice: property.price,
      averagePricePerSqft:
        property.sqft > 0 ? Math.round(property.price / property.sqft) : 0,
      indicatedValue: property.price,
      variancePct: 0,
      narrative:
        'No comparable sales were provided, so the indicated value defaults to ' +
        'the asking price. Supply recent nearby sales for a supported valuation.',
    };
  }

  const prices = comparables.map((c) => c.price).sort((a, b) => a - b);
  const averagePrice = Math.round(
    prices.reduce((sum, price) => sum + price, 0) / prices.length,
  );

  const mid = Math.floor(prices.length / 2);
  const medianPrice =
    prices.length % 2 === 0
      ? Math.round(((prices[mid - 1] ?? 0) + (prices[mid] ?? 0)) / 2)
      : (prices[mid] ?? 0);

  // Averaging each comparable's own rate is more robust than dividing summed
  // prices by summed area, which lets one large home dominate the result.
  const rates = comparables.filter((c) => c.sqft > 0).map((c) => c.price / c.sqft);
  const averagePricePerSqft =
    rates.length > 0
      ? Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length)
      : 0;

  const indicatedValue =
    property.sqft > 0 && averagePricePerSqft > 0
      ? Math.round(property.sqft * averagePricePerSqft)
      : averagePrice;

  const variancePct =
    indicatedValue > 0 ? ((property.price - indicatedValue) / indicatedValue) * 100 : 0;

  return {
    averagePrice,
    medianPrice,
    averagePricePerSqft,
    indicatedValue,
    variancePct,
    narrative: cmaNarrative(variancePct, comparables.length),
  };
}

function cmaNarrative(variancePct: number, sampleSize: number): string {
  const basis = `Based on ${sampleSize} comparable sale${sampleSize === 1 ? '' : 's'}, `;

  if (variancePct > 7) {
    return (
      basis +
      'the asking price sits meaningfully above the indicated value. Expect ' +
      'longer time on market unless the home offers condition or location ' +
      'advantages the comparables do not capture.'
    );
  }

  if (variancePct < -7) {
    return (
      basis +
      'the asking price sits below the indicated value. The listing is ' +
      'positioned to attract early competing interest.'
    );
  }

  return (
    basis +
    'the asking price is consistent with the indicated value. The listing is ' +
    'competitively positioned for current conditions.'
  );
}

function marketNarrative(input: GenerateMarketReportInput): string {
  switch (input.trend) {
    case 'sellers_market':
      return (
        'Inventory is constrained relative to demand. Sellers hold negotiating ' +
        'leverage, and well-presented homes are transacting quickly and at or ' +
        'above asking. Buyers should expect competition and prepare to move ' +
        'decisively on the right property.'
      );
    case 'buyers_market':
      return (
        'Supply exceeds current demand. Buyers have room to negotiate on price ' +
        'and terms, and sellers should expect to compete on presentation and ' +
        'pricing. Accurate initial pricing matters more than usual.'
      );
    case 'balanced':
    default:
      return (
        'Supply and demand are roughly matched. Neither side holds structural ' +
        'leverage, and outcomes turn on the specifics of each property rather ' +
        'than on broad market pressure.'
      );
  }
}

export const DOCUMENT_KINDS: readonly DocumentKind[] = [
  'cma',
  'brochure',
  'market_report',
];
