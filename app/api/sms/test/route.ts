import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendSms } from '@/lib/twilio'

/**
 * POST /api/sms/test
 * Commissioner-only endpoint to verify Twilio credentials and SMS delivery.
 *
 * Body: { to: "+12125551234", message?: "custom text" }
 *
 * Remove or gate this route once you've confirmed SMS is working.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Commissioner only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { to, message } = body

  if (!to) {
    return NextResponse.json(
      { error: 'Body must include "to" (E.164 phone number, e.g. +12125551234)' },
      { status: 400 }
    )
  }

  const text = message?.trim() ||
    '✅ SMS test from 5 on 2 Fantasy Wrestling — Twilio is connected and working!'

  const result = await sendSms(to, text)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true, sid: result.sid, to, message: text })
}
