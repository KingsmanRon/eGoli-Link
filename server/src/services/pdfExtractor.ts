import pdf from 'pdf-parse';
import { readFile } from 'fs/promises';
import { createCanvas } from 'canvas';
import * as pdfjs from 'pdfjs-dist';
import Tesseract from 'tesseract.js';
import { logger } from '../utils/logger.js';
import { extractStandNo, formatTownship } from '../utils/addressNormalizer.js';

// Set up pdfjs worker
const pdfjsPath = require.resolve('pdfjs-dist');
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsPath.replace('pdfjs-dist/build/pdf.mjs', 'pdfjs-dist/build/pdf.worker.mjs');

export interface ExtractedLocation {
  standNo: string;
  township: string;
  address: string;
  equipmentId?: string;
  equipmentType?: string;
  tableType?: 'MSS' | 'HVC' | 'LOAD_CENTRE';
}

export interface ExtractionResult {
  substationName: string;
  drawingNumber: string;
  locations: ExtractedLocation[];
  errors: string[];
  rawText?: string;
}

// Table header patterns
const TABLE_HEADERS = {
  STAND_NO: /\b(STAND\s*NO|ERF|LOT|PLOT)\b/i,
  TOWNSHIP: /\b(TOWNSHIP|SUBURB|AREA)\b/i,
  LOCATION: /\b(LOCATION|ADDRESS|STREET)\b/i,
};

// Table type identifiers
const TABLE_TYPES = {
  MSS: /\bMSS\s*SCHEDULE\b/i,
  HVC: /\bHVC\s*SCHEDULE\b/i,
  LOAD_CENTRE: /\bLOAD\s*CENTRE\s*SCHEDULE\b/i,
};

// Equipment patterns
const EQUIPMENT_PATTERNS = {
  TRANSFORMER: /\bTRFR\s*(\d+)\b/i,
  HVC: /\bHVC\s*(\d+)\b/i,
  MSS: /\bMSS\s*(\d+)\b/i,
  KVA: /(\d+)\s*kVA/i,
};

/**
 * Extract substation name from PDF title or header
 */
function extractSubstationName(text: string): string {
  // Look for patterns like "NIRVANA SUBSTATION" or "SUBSTATION: NIRVANA"
  const patterns = [
    /([A-Z][A-Z\s]+)\s*SUBSTATION/i,
    /SUBSTATION[:\s]+([A-Z][A-Z\s]+)/i,
    /TITLE[:\s]+([A-Z][A-Z\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim().toUpperCase();
    }
  }

  return 'Unknown Substation';
}

/**
 * Extract drawing number from PDF
 */
function extractDrawingNumber(text: string): string {
  // Look for patterns like "DWG NO: 14538" or "DRAWING: 14538"
  const patterns = [
    /(?:DWG|DRAWING|DRG)[\s.:No]*(\d+)/i,
    /NO[:\s]+(\d{4,6})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return '';
}

/**
 * Detect table type from surrounding text
 */
function detectTableType(text: string): 'MSS' | 'HVC' | 'LOAD_CENTRE' | null {
  if (TABLE_TYPES.MSS.test(text)) return 'MSS';
  if (TABLE_TYPES.HVC.test(text)) return 'HVC';
  if (TABLE_TYPES.LOAD_CENTRE.test(text)) return 'LOAD_CENTRE';
  return null;
}

/**
 * Parse a line of table data
 */
function parseTableLine(
  line: string,
  columnPositions: { standNo: number; township: number; location: number }
): ExtractedLocation | null {
  // Skip empty lines and header rows
  if (!line.trim() || TABLE_HEADERS.STAND_NO.test(line)) {
    return null;
  }

  // Try to extract based on column positions if available
  const parts = line.split(/\s{2,}|\t/).filter((p) => p.trim());

  if (parts.length < 3) {
    return null;
  }

  // Extract equipment info
  let equipmentId: string | undefined;
  let equipmentType: string | undefined;

  for (const part of parts) {
    const trfrMatch = part.match(EQUIPMENT_PATTERNS.TRANSFORMER);
    if (trfrMatch) {
      equipmentId = `TRFR ${trfrMatch[1]}`;
    }

    const kvaMatch = part.match(EQUIPMENT_PATTERNS.KVA);
    if (kvaMatch) {
      equipmentType = `${kvaMatch[1]}kVA`;
    }
  }

  // Heuristic: Find stand number (usually numeric or alphanumeric)
  let standNoIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    if (/^\d+[A-Z]?$|^[A-Z]?\d+$/.test(parts[i].trim())) {
      standNoIndex = i;
      break;
    }
  }

  const standNo = extractStandNo(parts[standNoIndex] || parts[0]);

  // Township is usually single word, location is multi-word address
  let township = '';
  let address = '';

  if (parts.length >= 3) {
    // Typical format: STAND_NO | TOWNSHIP | LOCATION
    township = formatTownship(parts[standNoIndex + 1] || '');
    address = parts.slice(standNoIndex + 2).join(' ').trim();
  } else if (parts.length === 2) {
    // Two columns - likely stand and combined township/location
    const combined = parts[1];
    const firstWord = combined.split(/\s+/)[0];
    township = formatTownship(firstWord);
    address = combined.replace(firstWord, '').trim();
  }

  // Validate we have minimum required data
  if (!standNo || (!township && !address)) {
    return null;
  }

  return {
    standNo,
    township: township || 'Unknown',
    address: address || `Stand ${standNo}`,
    equipmentId,
    equipmentType,
  };
}

/**
 * Find column positions in header line
 */
function findColumnPositions(headerLine: string): {
  standNo: number;
  township: number;
  location: number;
} {
  const standNoMatch = headerLine.match(TABLE_HEADERS.STAND_NO);
  const townshipMatch = headerLine.match(TABLE_HEADERS.TOWNSHIP);
  const locationMatch = headerLine.match(TABLE_HEADERS.LOCATION);

  return {
    standNo: standNoMatch?.index || 0,
    township: townshipMatch?.index || 20,
    location: locationMatch?.index || 40,
  };
}

/**
 * Extract table data from text
 */
function extractTablesFromText(text: string): ExtractedLocation[] {
  const locations: ExtractedLocation[] = [];
  const lines = text.split('\n');

  let currentTableType: 'MSS' | 'HVC' | 'LOAD_CENTRE' | null = null;
  let inTable = false;
  let columnPositions = { standNo: 0, township: 20, location: 40 };
  let headerFound = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for table type markers
    const tableType = detectTableType(line);
    if (tableType) {
      currentTableType = tableType;
      inTable = false;
      headerFound = false;
      continue;
    }

    // Check for header row
    if (TABLE_HEADERS.STAND_NO.test(line) && TABLE_HEADERS.LOCATION.test(line)) {
      columnPositions = findColumnPositions(line);
      inTable = true;
      headerFound = true;
      continue;
    }

    // Parse table rows
    if (headerFound) {
      const location = parseTableLine(line, columnPositions);
      if (location) {
        location.tableType = currentTableType || undefined;
        locations.push(location);
      } else if (line.trim() === '' && locations.length > 0) {
        // Empty line might indicate end of table
        // Continue looking for more tables
        inTable = false;
      }
    }
  }

  return locations;
}

/**
 * Extract text from image-based PDF using OCR
 */
async function extractTextWithOCR(buffer: Buffer): Promise<string> {
  try {
    logger.info('Starting OCR extraction for image-based PDF');

    // Load PDF document
    const loadingTask = pdfjs.getDocument({ data: buffer });
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;

    logger.info({ numPages }, 'PDF loaded for OCR');

    let fullText = '';

    // Process each page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR

      // Create canvas for rendering
      const canvas = createCanvas(viewport.width, viewport.height);
      const context = canvas.getContext('2d');

      // Render PDF page to canvas
      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport: viewport,
      }).promise;

      // Convert canvas to PNG buffer
      const imageBuffer = canvas.toBuffer('image/png');

      // Run OCR on the image
      const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            logger.debug({ page: pageNum, progress: m.progress }, 'OCR progress');
          }
        },
      });

      fullText += text + '\n';
      logger.info({ pageNum, textLength: text.length }, 'OCR completed for page');
    }

    return fullText;
  } catch (error) {
    logger.error({ error }, 'OCR extraction failed');
    throw error;
  }
}

/**
 * Main PDF extraction function
 */
export async function extractFromPDF(filePath: string): Promise<ExtractionResult> {
  const errors: string[] = [];

  try {
    // Read PDF file
    const dataBuffer = await readFile(filePath);

    // Parse PDF
    const pdfData = await pdf(dataBuffer);

    let text = pdfData.text;

    // If no text found, try OCR
    if (!text || text.trim().length === 0) {
      logger.info('No text found in PDF, attempting OCR extraction');
      try {
        text = await extractTextWithOCR(dataBuffer);
        if (!text || text.trim().length === 0) {
          errors.push('PDF appears to be empty. OCR could not extract any text.');
          return {
            substationName: 'Unknown',
            drawingNumber: '',
            locations: [],
            errors,
            rawText: '',
          };
        }
        logger.info({ textLength: text.length }, 'OCR extraction successful');
      } catch (ocrError) {
        const ocrErrorMessage = ocrError instanceof Error ? ocrError.message : 'Unknown OCR error';
        errors.push(`OCR extraction failed: ${ocrErrorMessage}`);
        return {
          substationName: 'Unknown',
          drawingNumber: '',
          locations: [],
          errors,
          rawText: '',
        };
      }
    }

    // Extract metadata
    const substationName = extractSubstationName(text);
    const drawingNumber = extractDrawingNumber(text);

    // Extract locations from tables
    const locations = extractTablesFromText(text);

    logger.info(
      {
        substationName,
        drawingNumber,
        locationCount: locations.length,
        pages: pdfData.numpages,
      },
      'PDF extraction complete'
    );

    if (locations.length === 0) {
      errors.push('No location data could be extracted from the PDF.');
    }

    return {
      substationName,
      drawingNumber,
      locations,
      errors,
      rawText: process.env.NODE_ENV === 'development' ? text : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error, filePath }, 'PDF extraction failed');
    errors.push(`PDF parsing error: ${errorMessage}`);

    return {
      substationName: 'Unknown',
      drawingNumber: '',
      locations: [],
      errors,
    };
  }
}

/**
 * Extract from PDF buffer (for uploaded files)
 */
export async function extractFromBuffer(buffer: Buffer): Promise<ExtractionResult> {
  const errors: string[] = [];

  try {
    const pdfData = await pdf(buffer);

    let text = pdfData.text;

    // If no text found, try OCR
    if (!text || text.trim().length === 0) {
      logger.info('No text found in PDF buffer, attempting OCR extraction');
      try {
        text = await extractTextWithOCR(buffer);
        if (!text || text.trim().length === 0) {
          errors.push('PDF appears to be empty. OCR could not extract any text.');
          return {
            substationName: 'Unknown',
            drawingNumber: '',
            locations: [],
            errors,
          };
        }
        logger.info({ textLength: text.length }, 'OCR extraction successful');
      } catch (ocrError) {
        const ocrErrorMessage = ocrError instanceof Error ? ocrError.message : 'Unknown OCR error';
        errors.push(`OCR extraction failed: ${ocrErrorMessage}`);
        return {
          substationName: 'Unknown',
          drawingNumber: '',
          locations: [],
          errors,
        };
      }
    }
    const substationName = extractSubstationName(text);
    const drawingNumber = extractDrawingNumber(text);
    const locations = extractTablesFromText(text);

    if (locations.length === 0) {
      errors.push('No location data could be extracted from the PDF.');
    }

    return {
      substationName,
      drawingNumber,
      locations,
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error }, 'PDF buffer extraction failed');
    errors.push(`PDF parsing error: ${errorMessage}`);

    return {
      substationName: 'Unknown',
      drawingNumber: '',
      locations: [],
      errors,
    };
  }
}

/**
 * Validate extraction result
 */
export function validateExtractionResult(result: ExtractionResult): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (result.locations.length === 0) {
    issues.push('No locations extracted');
  }

  // Check for locations without addresses
  const noAddress = result.locations.filter((l) => !l.address || l.address === `Stand ${l.standNo}`);
  if (noAddress.length > 0) {
    issues.push(`${noAddress.length} locations missing street addresses`);
  }

  // Check for duplicate stand numbers
  const standNos = result.locations.map((l) => `${l.standNo}-${l.township}`);
  const duplicates = standNos.filter((s, i) => standNos.indexOf(s) !== i);
  if (duplicates.length > 0) {
    issues.push(`${duplicates.length} duplicate stand numbers found`);
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
