import { ScoreRow } from './scoring'

/**
 * Extracts the spreadsheet ID from a Google Sheets URL.
 * Supports both /spreadsheets/d/ID/edit and /spreadsheets/d/ID formats.
 */
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

/**
 * Fetches rows from a Google Sheet using a service account.
 * The sheet must be shared with the service account email.
 *
 * Expected sheet columns (row 1 = headers):
 *   athlete_name | event | championship_wins | consolation_wins | bonus_points | placement
 */
export async function fetchSheetScores(
  spreadsheetId: string,
  range: string = 'Sheet1!A:F'
): Promise<{ rows: ScoreRow[]; errors: string[] }> {
  const errors: string[] = []
  const rows: ScoreRow[] = []

  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!serviceAccountEmail || !privateKey) {
    errors.push('Google Sheets credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.')
    return { rows, errors }
  }

  try {
    // Create JWT for Google OAuth
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
    const requiredHeaders = ['athlete_name', 'event', 'championship_wins', 'consolation_wins', 'bonus_points']
    for (const h of requiredHeaders) {
      if (!headers.includes(h)) {
        errors.push(`Sheet is missing required column: "${h}"`)
      }
    }
    if (errors.length > 0) return { rows, errors }

    const idx = (name: string) => headers.indexOf(name)

    values.slice(1).forEach((row, i) => {
      const lineNum = i + 2
      const get = (col: string) => row[idx(col)]?.trim() ?? ''

      const champWins = Number(get('championship_wins'))
      const consolWins = Number(get('consolation_wins'))
      const bonusPts = Number(get('bonus_points'))
      const placementStr = get('placement')
      const placement = placementStr ? Number(placementStr) : null

      if (!get('athlete_name') || !get('event')) {
        errors.push(`Row ${lineNum}: missing athlete_name or event — skipped`)
        return
      }

      rows.push({
        athlete_name: get('athlete_name'),
        event: get('event'),
        championship_wins: isNaN(champWins) ? 0 : champWins,
        consolation_wins: isNaN(consolWins) ? 0 : consolWins,
        bonus_points: isNaN(bonusPts) ? 0 : bonusPts,
        placement: placement && !isNaN(placement) && placement >= 1 && placement <= 8 ? placement : null,
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
