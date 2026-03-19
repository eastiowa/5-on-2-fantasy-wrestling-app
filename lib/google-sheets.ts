import { CumulativeScoreRow } from './scoring'

/**
 * Extracts the spreadsheet ID from a Google Sheets URL.
 * Supports both /spreadsheets/d/ID/edit and /spreadsheets/d/ID formats.
 */
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

// ─── Valid NCAA weight classes ─────────────────────────────────────────────
const WEIGHT_CLASSES = new Set([125, 133, 141, 149, 157, 165, 174, 184, 197, 285])

/**
 * Detect whether the raw 2-D values array is in bracket format.
 *
 * Bracket format (new): the second cell of the first non-empty row is a
 * recognised weight class number (125, 133, …) and subsequent header cells
 * start with "S-".
 *
 * Flat format (legacy): the first row contains "name" and "score" headers.
 */
function isBracketFormat(values: string[][]): boolean {
  if (!values.length) return false
  const first = values[0]
  const secondCell = Number(first[1]?.trim())
  const hasSessionCols = first.slice(2).some((h) => /^S-\d+$/i.test(h?.trim() ?? ''))
  return WEIGHT_CLASSES.has(secondCell) && hasSessionCols
}

/**
 * Parse the bracket-style sheet.
 *
 * Layout (all weight classes stacked on one sheet):
 *   Header row :  <blank> | <weight> | S-1 | S-2 | S-3 | S-4 | S-5 | S-6
 *   Wrestler rows: <seed>  | "{seed}) {Name} ({School}) {record}" | pts | pts …
 *
 * Rules:
 *   - A weight-class header row is identified by col[1] being a pure number
 *     that is a valid NCAA weight class.
 *   - A wrestler row is identified by col[1] matching the pattern
 *     /^\d+\) .+ \([A-Z]+\) \d+-\d+/.
 *   - Total score = sum of S-1 … S-6 (any numeric value in cols 2-7).
 *   - Rows with a total score of 0 are excluded (athlete hasn't competed yet).
 *   - place is read from a "Place" column if present, otherwise null.
 */
function parseBracketFormat(values: string[][]): { rows: CumulativeScoreRow[]; errors: string[] } {
  const rows: CumulativeScoreRow[] = []
  const errors: string[] = []

  // Find how many session columns exist (S-1, S-2, …)
  const headerRow = values[0]
  const sessionIndices: number[] = []
  for (let c = 2; c < headerRow.length; c++) {
    if (/^S-\d+$/i.test(headerRow[c]?.trim() ?? '')) sessionIndices.push(c)
  }
  // Look for an optional Place column
  const placeColIdx = headerRow.findIndex((h) => /^place$/i.test(h?.trim() ?? ''))

  let currentWeight: number | null = null

  for (let i = 1; i < values.length; i++) {
    const row = values[i]
    const col1 = row[1]?.trim() ?? ''

    // ── Weight class header? ─────────────────────────────────────────────────
    const wNum = Number(col1)
    if (WEIGHT_CLASSES.has(wNum)) {
      currentWeight = wNum
      continue
    }

    // ── Wrestler row? ────────────────────────────────────────────────────────
    // Format: "4) Sheldon Seymour (LEH) 19-0"
    const wrestlerMatch = col1.match(/^\d+\)\s*(.+?)\s*\(([A-Z]+)\)\s*\d+-\d+/)
    if (!wrestlerMatch) continue
    if (!currentWeight) {
      errors.push(`Row ${i + 1}: wrestler "${col1}" found before any weight class header — skipped`)
      continue
    }

    const name = wrestlerMatch[1].trim()

    // Sum session scores
    let score = 0
    for (const ci of sessionIndices) {
      const v = parseFloat(row[ci]?.trim() ?? '')
      if (!isNaN(v) && v > 0) score += v
    }

    // Skip athletes with no points yet (tournament not started / eliminated early with 0 pts)
    if (score === 0) continue

    // Optional placement
    let place: number | null = null
    if (placeColIdx >= 0) {
      const pv = parseInt(row[placeColIdx]?.trim() ?? '', 10)
      if (!isNaN(pv) && pv >= 1 && pv <= 8) place = pv
    }

    rows.push({ name, team: '', weight: currentWeight, place, score })
  }

  return { rows, errors }
}

/**
 * Fetches score rows from a Google Sheet using a service account.
 * The sheet must be shared with the service account email.
 *
 * Supports two formats automatically:
 *
 * ── Bracket format (new) ──────────────────────────────────────────────────
 *   All weight classes stacked vertically on one sheet.
 *   Header rows:    <blank> | <weight_class> | S-1 | S-2 | S-3 | S-4 | S-5 | S-6
 *   Wrestler rows:  <seed>  | "{seed}) Name (School) record" | per-session pts …
 *   Total score = sum of S-1 … S-6.  Rows with score = 0 are skipped.
 *
 * ── Flat format (legacy) ─────────────────────────────────────────────────
 *   Row 1 headers:  name | team | weight | place | score
 *   "score" is the pre-computed cumulative total.
 */
export async function fetchSheetScores(
  spreadsheetId: string,
  range: string = 'A:J'           // wide enough for bracket format (seed + wrestler + 6 sessions + extras)
): Promise<{ rows: CumulativeScoreRow[]; errors: string[] }> {
  const errors: string[] = []
  const rows: CumulativeScoreRow[] = []

  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!serviceAccountEmail || !privateKey) {
    errors.push('Google Sheets credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.')
    return { rows, errors }
  }

  try {
    const token = await getGoogleAccessToken(serviceAccountEmail, privateKey)

    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const body = await res.text()
      errors.push(`Google Sheets API error: ${res.status} ${body}`)
      return { rows, errors }
    }

    const data = await res.json()
    const values: string[][] = data.values ?? []

    if (values.length < 2) {
      errors.push('Sheet appears to be empty or missing data rows.')
      return { rows, errors }
    }

    // ── Detect format and delegate ────────────────────────────────────────────
    if (isBracketFormat(values)) {
      const result = parseBracketFormat(values)
      return { rows: result.rows, errors: [...errors, ...result.errors] }
    }

    // ── Legacy flat format ────────────────────────────────────────────────────
    const headers = values[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
    if (!headers.includes('name') || !headers.includes('score')) {
      errors.push('Sheet must have at least "name" and "score" columns (flat format) or be a bracket-format sheet.')
      return { rows, errors }
    }

    const idx = (col: string) => headers.indexOf(col)

    values.slice(1).forEach((row, i) => {
      const lineNum = i + 2
      const get = (col: string) => row[idx(col)]?.trim() ?? ''

      const name = get('name')
      if (!name) { errors.push(`Row ${lineNum}: missing name — skipped`); return }

      const scoreStr = get('score')
      const score = Number(scoreStr)
      if (!scoreStr || isNaN(score) || score < 0) {
        errors.push(`Row ${lineNum}: invalid score for "${name}" — skipped`)
        return
      }

      const placeStr = get('place')
      const placeParsed = placeStr ? Number(placeStr) : null
      const place = placeParsed && !isNaN(placeParsed) && placeParsed >= 1 && placeParsed <= 8
        ? placeParsed : null

      const weightStr = get('weight')
      const weightParsed = weightStr ? Number(weightStr) : null
      const weight = weightParsed && !isNaN(weightParsed) ? weightParsed : null

      rows.push({ name, team: get('team'), weight, place, score })
    })
  } catch (err) {
    errors.push(`Unexpected error fetching sheet: ${String(err)}`)
  }

  return { rows, errors }
}

/**
 * Generates a Google OAuth 2.0 access token using a service account JWT.
 */
async function getGoogleAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }

  // Build JWT header + payload
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const body = btoa(JSON.stringify(payload))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const signingInput = `${header}.${body}`

  // Import private key
  const keyData = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${sig}`

  // Exchange JWT for access token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Failed to get Google access token: ${JSON.stringify(tokenData)}`)
  }

  return tokenData.access_token
}
