/**
 * Twilio SMS utility — no SDK dependency, uses the Twilio REST API directly.
 *
 * Required env vars (set in Vercel dashboard + local .env.local):
 *   TWILIO_ACCOUNT_SID   — e.g. ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN    — from Twilio console
 *   TWILIO_FROM_NUMBER   — your Twilio phone number, E.164 format: +12125551234
 */

export interface SmsSendResult {
  success: boolean
  sid?: string
  error?: string
}

/**
 * Sends an SMS via the Twilio Messages API.
 *
 * @param to   Recipient phone number in E.164 format (+12125551234)
 * @param body Message text (≤160 chars for a single SMS segment)
 */
export async function sendSms(to: string, body: string): Promise<SmsSendResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER

  if (!accountSid || !authToken || !from) {
    console.warn('[twilio] SMS credentials not configured — message not sent')
    return { success: false, error: 'SMS not configured (missing env vars)' }
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const params = new URLSearchParams({ From: from, To: to, Body: body })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const data = await res.json() as { sid?: string; message?: string; code?: number }

    if (!res.ok) {
      console.error('[twilio] API error:', data)
      return { success: false, error: data.message ?? `HTTP ${res.status}` }
    }

    return { success: true, sid: data.sid }
  } catch (err) {
    console.error('[twilio] Network error:', err)
    return { success: false, error: String(err) }
  }
}
