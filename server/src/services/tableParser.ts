/**
 * Table Parser Service
 * Specialized parsing for City Power MSS, HVC, and Load Centre Schedule tables
 */

import { logger } from '../utils/logger.js';
import { extractStandNo, formatTownship } from '../utils/addressNormalizer.js';

export interface TableColumn {
  name: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedRow {
  standNo: string;
  township: string;
  address: string;
  equipmentId?: string;
  equipmentType?: string;
  rawData: Record<string, string>;
}

export interface ParsedTable {
  type: 'MSS' | 'HVC' | 'LOAD_CENTRE' | 'UNKNOWN';
  columns: TableColumn[];
  rows: ParsedRow[];
  headerLine: string;
}

// Column name variations for each field
const COLUMN_PATTERNS = {
  standNo: ['STAND NO', 'STAND', 'ERF', 'ERF NO', 'LOT', 'PLOT', 'PROPERTY'],
  township: ['TOWNSHIP', 'SUBURB', 'AREA', 'LOCATION', 'EXT'],
  address: ['LOCATION', 'ADDRESS', 'STREET', 'PHYSICAL ADDRESS'],
  equipment: ['EQUIPMENT', 'TRFR', 'TRANSFORMER', 'HVC', 'MSS'],
  rating: ['RATING', 'KVA', 'SIZE', 'CAPACITY'],
};

/**
 * Detect table boundaries in text
 */
export function detectTableBoundaries(text: string): Array<{
  startLine: number;
  endLine: number;
  type: 'MSS' | 'HVC' | 'LOAD_CENTRE' | 'UNKNOWN';
}> {
  const lines = text.split('\n');
  const tables: Array<{
    startLine: number;
    endLine: number;
    type: 'MSS' | 'HVC' | 'LOAD_CENTRE' | 'UNKNOWN';
  }> = [];

  let currentTable: {
    startLine: number;
    type: 'MSS' | 'HVC' | 'LOAD_CENTRE' | 'UNKNOWN';
  } | null = null;
  let emptyLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for table type headers
    let tableType: 'MSS' | 'HVC' | 'LOAD_CENTRE' | 'UNKNOWN' = 'UNKNOWN';
    if (/MSS\s*SCHEDULE/i.test(line)) tableType = 'MSS';
    else if (/HVC\s*SCHEDULE/i.test(line)) tableType = 'HVC';
    else if (/LOAD\s*CENTRE/i.test(line)) tableType = 'LOAD_CENTRE';

    if (tableType !== 'UNKNOWN') {
      // End previous table if exists
      if (currentTable) {
        tables.push({
          ...currentTable,
          endLine: i - 1,
        });
      }
      currentTable = { startLine: i, type: tableType };
      emptyLineCount = 0;
      continue;
    }

    // Check for column headers (indicates table start)
    const hasStandNo = COLUMN_PATTERNS.standNo.some((p) =>
      new RegExp(`\\b${p}\\b`, 'i').test(line)
    );
    const hasAddress = COLUMN_PATTERNS.address.some((p) =>
      new RegExp(`\\b${p}\\b`, 'i').test(line)
    );

    if (hasStandNo && hasAddress && !currentTable) {
      currentTable = { startLine: i, type: 'UNKNOWN' };
      emptyLineCount = 0;
    }

    // Track empty lines to detect table end
    if (line === '') {
      emptyLineCount++;
      if (emptyLineCount >= 3 && currentTable) {
        tables.push({
          ...currentTable,
          endLine: i - emptyLineCount,
        });
        currentTable = null;
      }
    } else {
      emptyLineCount = 0;
    }
  }

  // Close any open table
  if (currentTable) {
    tables.push({
      ...currentTable,
      endLine: lines.length - 1,
    });
  }

  return tables;
}

/**
 * Parse column positions from header line
 */
export function parseColumnPositions(headerLine: string): TableColumn[] {
  const columns: TableColumn[] = [];
  const allPatterns = [
    ...COLUMN_PATTERNS.standNo,
    ...COLUMN_PATTERNS.township,
    ...COLUMN_PATTERNS.address,
    ...COLUMN_PATTERNS.equipment,
    ...COLUMN_PATTERNS.rating,
  ];

  // Find all column headers and their positions
  const found: Array<{ name: string; index: number }> = [];

  for (const pattern of allPatterns) {
    const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
    let match;
    while ((match = regex.exec(headerLine)) !== null) {
      // Avoid duplicates at same position
      if (!found.some((f) => Math.abs(f.index - match!.index) < 3)) {
        found.push({ name: pattern, index: match.index });
      }
    }
  }

  // Sort by position
  found.sort((a, b) => a.index - b.index);

  // Create columns with estimated widths
  for (let i = 0; i < found.length; i++) {
    const startIndex = found[i].index;
    const endIndex = i < found.length - 1 ? found[i + 1].index - 1 : headerLine.length;

    columns.push({
      name: found[i].name.toUpperCase(),
      startIndex,
      endIndex,
    });
  }

  return columns;
}

/**
 * Extract value from line based on column position
 */
function extractColumnValue(
  line: string,
  column: TableColumn,
  nextColumn?: TableColumn
): string {
  const start = column.startIndex;
  const end = nextColumn ? nextColumn.startIndex : line.length;

  return line.substring(start, end).trim();
}

/**
 * Parse a single table row
 */
export function parseTableRow(line: string, columns: TableColumn[]): ParsedRow | null {
  if (!line.trim()) return null;

  // Skip header-like rows
  const headerPatterns = [...COLUMN_PATTERNS.standNo, ...COLUMN_PATTERNS.address];
  for (const pattern of headerPatterns) {
    if (new RegExp(`^\\s*${pattern}\\b`, 'i').test(line)) {
      return null;
    }
  }

  const rawData: Record<string, string> = {};

  // Extract values based on column positions
  for (let i = 0; i < columns.length; i++) {
    const value = extractColumnValue(line, columns[i], columns[i + 1]);
    rawData[columns[i].name] = value;
  }

  // Map to standard fields
  let standNo = '';
  let township = '';
  let address = '';
  let equipmentId: string | undefined;
  let equipmentType: string | undefined;

  for (const [key, value] of Object.entries(rawData)) {
    const keyUpper = key.toUpperCase();

    if (COLUMN_PATTERNS.standNo.some((p) => keyUpper.includes(p))) {
      standNo = extractStandNo(value);
    } else if (COLUMN_PATTERNS.township.some((p) => keyUpper.includes(p))) {
      township = formatTownship(value);
    } else if (COLUMN_PATTERNS.address.some((p) => keyUpper.includes(p))) {
      address = value;
    } else if (COLUMN_PATTERNS.equipment.some((p) => keyUpper.includes(p))) {
      equipmentId = value;
    } else if (COLUMN_PATTERNS.rating.some((p) => keyUpper.includes(p))) {
      equipmentType = value;
    }
  }

  // Validate minimum required data
  if (!standNo && !address) {
    return null;
  }

  return {
    standNo: standNo || 'Unknown',
    township: township || 'Unknown',
    address: address || '',
    equipmentId,
    equipmentType,
    rawData,
  };
}

/**
 * Parse a complete table from text lines
 */
export function parseTable(
  lines: string[],
  tableType: 'MSS' | 'HVC' | 'LOAD_CENTRE' | 'UNKNOWN'
): ParsedTable {
  const rows: ParsedRow[] = [];
  let columns: TableColumn[] = [];
  let headerLine = '';

  // Find header line
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const line = lines[i];
    const hasStandNo = COLUMN_PATTERNS.standNo.some((p) =>
      new RegExp(`\\b${p}\\b`, 'i').test(line)
    );

    if (hasStandNo) {
      headerLine = line;
      columns = parseColumnPositions(line);
      break;
    }
  }

  // Parse data rows
  const startIndex = lines.indexOf(headerLine) + 1;
  for (let i = startIndex; i < lines.length; i++) {
    const row = parseTableRow(lines[i], columns);
    if (row) {
      rows.push(row);
    }
  }

  logger.debug(
    {
      tableType,
      columnCount: columns.length,
      rowCount: rows.length,
    },
    'Table parsed'
  );

  return {
    type: tableType,
    columns,
    rows,
    headerLine,
  };
}

/**
 * Parse all tables from PDF text
 */
export function parseAllTables(text: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const lines = text.split('\n');
  const boundaries = detectTableBoundaries(text);

  for (const boundary of boundaries) {
    const tableLines = lines.slice(boundary.startLine, boundary.endLine + 1);
    const table = parseTable(tableLines, boundary.type);

    if (table.rows.length > 0) {
      tables.push(table);
    }
  }

  logger.info(
    {
      tableCount: tables.length,
      totalRows: tables.reduce((sum, t) => sum + t.rows.length, 0),
    },
    'All tables parsed'
  );

  return tables;
}
