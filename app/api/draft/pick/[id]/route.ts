import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Commissioner only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'commissioner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Fetch the pick being removed
  const { data: pick, error: pickFetchErr } = await admin
    .from('draft_picks')
    .select('id, pick_number, athlete_id')
    .eq('id', id)
    .single()

  if (pickFetchErr || !pick) {
    return NextResponse.json({ error: 'Pick not found' }, { status: 404 })
  }

  const removedPickNumber: number = pick.pick_number

  // Fetch all picks at or after the removed pick number (to cascade-delete them)
  const { data: picksToRemove, error: fetchErr } = await admin
    .from('draft_picks')
    .select('id, athlete_id')
    .gte('pick_number', removedPickNumber)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  const athleteIds = (picksToRemove ?? []).map((p: { athlete_id: string }) => p.athlete_id)
  const pickIds = (picksToRemove ?? []).map((p: { id: string }) => p.id)

  // Delete all picks at or after this pick number
  if (pickIds.length > 0) {
    const { error: deleteErr } = await admin
      .from('draft_picks')
      .delete()
      .in('id', pickIds)

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }
  }

  // Reset is_drafted = false for all affected athletes
  if (athleteIds.length > 0) {
    const { error: athleteErr } = await admin
      .from('athletes')
      .update({ is_drafted: false })
      .in('id', athleteIds)

    if (athleteErr) {
      console.error('[draft/pick/delete] athlete reset error:', athleteErr.message)
    }
  }

  // Roll current_pick_number back to the removed pick's number
  const { error: settingsErr } = await admin
    .from('draft_settings')
    .update({
      current_pick_number: removedPickNumber,
      status: 'active',
      pick_started_at: new Date().toISOString(),
    })
    .neq('id', '00000000-0000-0000-0000-000000000000') // update the single row

  if (settingsErr) {
    console.error('[draft/pick/delete] draft_settings update error:', settingsErr.message)
  }

  // Post a system chat message
  await admin.from('draft_chat_messages').insert({
    sender_name: 'Draft Bot',
    sender_role: 'system',
    is_system: true,
    message: `⚠️ Commissioner removed pick #${removedPickNumber}${picksToRemove && picksToRemove.length > 1 ? ` and ${picksToRemove.length - 1} subsequent pick(s)` : ''}. Draft has been rolled back to pick #${removedPickNumber}.`,
  })

  return NextResponse.json({
    success: true,
    removed_from_pick: removedPickNumber,
    picks_deleted: pickIds.length,
    athletes_reset: athleteIds.length,
  })
}
