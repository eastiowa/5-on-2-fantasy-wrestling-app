import { CumulativeScoreRow } from './scoring'

/**
 * Extracts the spreadsheet ID from a Google Sheets URL.
 * Supports both /spreadsheets/d/ID/edit and /spreadsheets/d/ID formats.
 */
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Fetches cumulative score rows from a Google Sheet using a service account.
 * The sheet must be shared with the service account email.
 *
 * Expected sheet columns (row 1 = headers):
 *   name | team | weight | place | score
 *
 * "score" is the cumulative total — uploaded rows OVERWRITE existing scores.
 */
export async function fetchSheetScores(
  spreadsheetId: string,
  range: string = 'Sheet1!A:E'
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

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
    const res = await fetch(url, {
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
      errors.push('Sheet appears to be empty or missing headers.')
      return { rows, errors }
    }

    // Normalize headers
    const headers = values[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
    if (!headers.includes('name') || !headers.includes('score')) {
      errors.push('Sheet must have at least "name" and "score" columns.')
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

      rows.push({
        name,
        team: get('team'),
        weight,
        place,
        score,
      })
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
