/**
 * Normalize Unicode lookalike characters in text strings (song titles, band names, etc.)
 * Replaces typographic/Unicode variants with plain ASCII equivalents so they render
 * cleanly everywhere (file names, ID3 tags, display UI).
 */

export function normalizeUnicode(str: string): string {
  if (!str) return str

  return str
    // Unicode hyphens → ASCII hyphen
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    // Curly/typographic apostrophes and single quotes → ASCII apostrophe
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\uFF07]/g, "'")
    // Curly/typographic double quotes → ASCII double quote
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\uFF02]/g, '"')
    // Ellipsis → three dots
    .replace(/\u2026/g, '...')
    // Non-breaking space, thin space, em space, etc. → regular space
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    // Zero-width characters (invisible junk)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    // Bullet / middle dot variants → hyphen (common in song title separators)
    .replace(/[\u2022\u2023\u2024\u2027\u2043\u22C5\u00B7]/g, '-')
    // Trim any resulting extra whitespace
    .replace(/\s{2,}/g, ' ')
    .trim()
}
