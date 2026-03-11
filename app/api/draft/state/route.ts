import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { isInOvernightPause } from '@/lib/draft-logic'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('draft_settings').select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Draft settings not found' }, { status: 404 })

  // Compute overnight-pause status — guard against columns not existing yet
  // (before migration 003 has been run)
  let paused = false
  try {
    paused = isInOvernightPause(
      data.overnight_pause_enabled ?? false,
      data.pause_start_hour ?? 22,
      data.pause_end_hour ?? 8
    )
  } catch {
    paused = false
  }

  return NextResponse.json({ ...data, is_in_overnight_pause: paused })
}
