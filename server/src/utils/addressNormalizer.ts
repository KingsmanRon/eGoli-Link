/**
 * Address Normalizer for South African Addresses
 * Handles common abbreviations and formatting for geocoding
 */

interface NormalizationResult {
  normalized: string;
  original: string;
  township: string;
  changes: string[];
}

// Common South African address abbreviations
const ABBREVIATIONS: Record<string, string> = {
  'CNR': 'Corner',
  'CRN': 'Corner',
  'OPP': 'Opposite',
  'NR': 'Number',
  'NO': 'Number',
  'RD': 'Road',
  'ST': 'Street',
  'STR': 'Street',
  'AVE': 'Avenue',
  'AV': 'Avenue',
  'BLVD': 'Boulevard',
  'DR': 'Drive',
  'PL': 'Place',
  'CL': 'Close',
  'CR': 'Crescent',
  'CRES': 'Crescent',
  'CT': 'Court',
  'LN': 'Lane',
  'HWY': 'Highway',
  'N/S': 'North South',
  'E/W': 'East West',
  'EXT': 'Extension',
  'EXTN': 'Extension',
  'B/H': 'Behind',
  'ADJ': 'Adjacent to',
  'BTW': 'Between',
  'NXT': 'Next to',
};

// Words that should remain uppercase
const PRESERVE_UPPERCASE = new Set([
  'CBD',
  'JHB',
  'JNB',
  'CPT',
  'DBN',
  'PTY',
  'PE',
  'EL',
]);

/**
 * Capitalizes the first letter of each word
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (PRESERVE_UPPERCASE.has(word.toUpperCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Replaces abbreviations with full words
 */
function expandAbbreviations(address: string): { expanded: string; changes: string[] } {
  const changes: string[] = [];
  let expanded = address;

  // Replace & with 'and'
  if (expanded.includes('&')) {
    expanded = expanded.replace(/\s*&\s*/g, ' and ');
    changes.push('& → and');
  }

  // Replace abbreviations (word boundaries)
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
    if (regex.test(expanded)) {
      expanded = expanded.replace(regex, full);
      changes.push(`${abbr} → ${full}`);
    }
  }

  return { expanded, changes };
}

/**
 * Cleans up whitespace and formatting
 */
function cleanWhitespace(address: string): string {
  return address
    .replace(/\s+/g, ' ')           // Multiple spaces to single
    .replace(/\s*,\s*/g, ', ')      // Normalize comma spacing
    .replace(/\s*-\s*/g, '-')       // Normalize dash spacing
    .replace(/^\s+|\s+$/g, '')      // Trim
    .replace(/\s+\./g, '.')         // Remove space before period
    .replace(/\.{2,}/g, '.');       // Multiple periods to single
}

/**
 * Removes common noise from addresses
 */
function removeNoise(address: string): string {
  return address
    .replace(/\(.*?\)/g, '')        // Remove parenthetical content
    .replace(/\[.*?\]/g, '')        // Remove bracketed content
    .replace(/\b(TRFR|HVC|MSS|LV|MV|HV)\s*\d+\b/gi, '') // Remove equipment refs
    .replace(/\b\d+kVA?\b/gi, '')   // Remove kVA ratings
    .replace(/\bNO\s*STREET\s*NAME\b/gi, '') // Remove "NO STREET NAME"
    .replace(/\bN\/A\b/gi, '')      // Remove N/A
    .replace(/\bTBA\b/gi, '')       // Remove TBA
    .replace(/^[\s,.-]+|[\s,.-]+$/g, ''); // Trim special chars
}

/**
 * Main normalization function
 * Converts South African addresses to geocoding-friendly format
 */
export function normalizeAddress(address: string, township: string): NormalizationResult {
  const original = address;
  const changes: string[] = [];

  // Step 1: Convert to uppercase for consistent processing
  let normalized = address.toUpperCase();

  // Step 2: Remove noise (equipment refs, etc.)
  const cleaned = removeNoise(normalized);
  if (cleaned !== normalized) {
    changes.push('Removed equipment references');
    normalized = cleaned;
  }

  // Step 3: Expand abbreviations
  const { expanded, changes: abbrChanges } = expandAbbreviations(normalized);
  normalized = expanded;
  changes.push(...abbrChanges);

  // Step 4: Clean whitespace
  normalized = cleanWhitespace(normalized);

  // Step 5: Apply title case
  normalized = toTitleCase(normalized);

  // Step 6: Append location context
  const townshipClean = toTitleCase(township.trim());

  // Build the full address
  if (normalized.length > 0) {
    normalized = `${normalized}, ${townshipClean}, Gauteng, South Africa`;
  } else {
    // If address is empty after cleaning, just use township
    normalized = `${townshipClean}, Gauteng, South Africa`;
    changes.push('Using township only (no valid street address)');
  }

  return {
    normalized,
    original,
    township: townshipClean,
    changes,
  };
}

/**
 * Validates if an address is likely to geocode successfully
 */
export function validateAddress(address: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check for empty or too short
  if (!address || address.trim().length < 3) {
    issues.push('Address is too short');
  }

  // Check for "no street name" variants
  if (/no\s*street\s*name|n\/a|tba|unknown/i.test(address)) {
    issues.push('Address contains placeholder text');
  }

  // Check if it's just numbers
  if (/^\d+$/.test(address.trim())) {
    issues.push('Address is only numbers');
  }

  // Check for equipment-only refs
  if (/^(TRFR|HVC|MSS|LV|MV)\s*\d+$/i.test(address.trim())) {
    issues.push('Address is only equipment reference');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Extracts stand number from various formats
 */
export function extractStandNo(value: string): string {
  // Handle formats like "Stand 123", "ERF 456", "123/45"
  const cleaned = value.trim().toUpperCase();

  // Remove common prefixes
  return cleaned
    .replace(/^(STAND|ERF|LOT|PLOT|PORTION)\s*/i, '')
    .replace(/^(PTN|RE)\s*/i, '')
    .trim();
}

/**
 * Formats township name consistently
 */
export function formatTownship(township: string): string {
  return toTitleCase(township.trim())
    .replace(/\s+ext\.?\s*/gi, ' Extension ')
    .replace(/\s+x\s*(\d+)/gi, ' Extension $1')
    .trim();
}
