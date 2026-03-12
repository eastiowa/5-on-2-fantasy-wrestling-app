import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const BASE_FIELDS = ['pick_timer_seconds', 'auto_skip_on_timeout', 'snake_enabled', 'draft_start_date']
const OVERNIGHT_FIELDS = ['overnight_pause_enabled', 'pause_start_hour', 'pause_end_hour']

export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()

  // Get the existing settings row id
  const { data: settings } = await supabase
    .from('draft_settings')
    .select('id')
    .maybeSingle()
  if (!settings) {
    return NextResponse.json({ error: 'Draft settings not found' }, { status: 404 })
  }

  // Build full update payload
  const allAllowed = [...BASE_FIELDS, ...OVERNIGHT_FIELDS]
  const fullUpdate = Object.fromEntries(
    Object.entries(body).filter(([k]) => allAllowed.includes(k))
  )

  if (Object.keys(fullUpdate).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Attempt full save (including overnight pause columns if present in schema)
  const { data, error } = await supabase
    .from('draft_settings')
    .update(fullUpdate)
    .eq('id', settings.id)
    .select()
    .single()

  if (!error) {
    return NextResponse.json(data)
  }

  // If the error is about a missing overnight-pause column, the migration hasn't
  // been run yet. Fall back to saving only the base fields so other settings
  // still work. Return a warning alongside the saved data.
  const missingColumn =
    error.message?.includes('overnight_pause_enabled') ||
    error.message?.includes('pause_start_hour') ||
    error.message?.includes('pause_end_hour') ||
    error.code === 'PGRST204'

  if (missingColumn) {
    const baseUpdate = Object.fromEntries(
      Object.entries(body).filter(([k]) => BASE_FIELDS.includes(k))
    )

    const { data: fallbackData, error: fallbackError } = await supabase
      .from('draft_settings')
      .update(baseUpdate)
      .eq('id', settings.id)
      .select()
      .single()

    if (fallbackError) {
      return NextResponse.json({ error: fallbackError.message }, { status: 500 })
    }

    return NextResponse.json({
      ...fallbackData,
      _warning:
        'Overnight pause settings were not saved — run migration 003_overnight_pause.sql in your Supabase SQL Editor to enable this feature.',
    })
  }

  return NextResponse.json({ error: error.message }, { status: 500 })
}
