import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getTeamForPick, getPickMeta, selectAutoPickAthlete } from '@/lib/draft-logic'
import { Team, Athlete, DraftPick } from '@/types'
import { sendSms } from '@/lib/twilio'

/**
 * POST /api/draft/autopick
 *
 * Triggered when:
 *   a) The pick timer expires (any connected client can trigger this — the server
 *      validates that the timer has actually elapsed before proceeding).
 *   b) A team has auto_draft=true and it becomes their turn.
 *
 * Selection order:
 *   1. Highest-ranked eligible wishlist athlete (lowest `rank` value that passes
 *      weight-class + seed constraints for the team).
 *   2. Best available athlete: lowest seed number (ties broken by weight class,
 *      lightest first) that passes constraints.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // ── 1. Load draft state ────────────────────────────────────────────────────
  const { data: draftSettings } = await supabase.from('draft_settings').select('*').single()
  if (!draftSettings) return NextResponse.json({ error: 'Draft not configured' }, { status: 400 })
  if (draftSettings.status !== 'active') {
    return NextResponse.json({ error: `Draft is ${draftSettings.status}` }, { status: 400 })
  }

  // ── 2. Resolve teams with draft positions ──────────────────────────────────
  const { data: teamsRaw } = await supabase.from('teams').select('*')
  if (!teamsRaw || teamsRaw.length === 0) {
    return NextResponse.json({ error: 'No teams configured' }, { status: 400 })
  }
  const { data: currentSeason } = await supabase
    .from('seasons').select('id').eq('is_current', true).maybeSingle()

  let teams = teamsRaw.map((t) => ({ ...t, draft_position: null as number | null }))
  if (currentSeason) {
    const { data: teamSeasons } = await supabase
      .from('team_seasons').select('team_id, draft_position').eq('season_id', currentSeason.id)
    const posMap: Record<string, number | null> = {}
    teamSeasons?.forEach((ts) => { posMap[ts.team_id] = ts.draft_position })
    teams = teams
      .map((t) => ({ ...t, draft_position: posMap[t.id] ?? null }))
      .sort((a, b) => (a.draft_position ?? 99) - (b.draft_position ?? 99))
  }

  // ── 3. Determine whose turn it is ─────────────────────────────────────────
  const currentPick = draftSettings.current_pick_number
  const activeTeam = getTeamForPick(currentPick, teams as Team[])

  // ── 4. Verify caller has permission to trigger autopick ───────────────────
  //   Allowed when:
  //     a) Timer has expired  — any authenticated user may trigger
  //     b) activeTeam has auto_draft=true — any authenticated user may trigger
  //     c) The caller is the commissioner (admin override)
  //
  //   NOTE: Being the active team manager alone does NOT grant permission.
  //   The timer must have genuinely elapsed or auto_draft must be enabled,
  //   otherwise manual calls to this endpoint would bypass both safeguards.
  const { data: profile } = await supabase
    .from('profiles').select('role, team_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const isCommissioner = profile.role === 'commissioner'

  // Check timer expiry (server-side)
  const timerEnabled = draftSettings.pick_timer_seconds > 0
  let timerExpired = false
  if (timerEnabled && draftSettings.pick_started_at) {
    const elapsed = (Date.now() - new Date(draftSettings.pick_started_at).getTime()) / 1000
    timerExpired = elapsed >= draftSettings.pick_timer_seconds
  }

  // Check team's auto_draft setting
  const teamRecord = teamsRaw.find((t) => t.id === activeTeam.id)
  const teamAutoDraft = teamRecord?.auto_draft === true

  if (!isCommissioner && !timerExpired && !teamAutoDraft) {
    return NextResponse.json(
      { error: 'Cannot autopick: timer has not expired and autodraft is not enabled for this team.' },
      { status: 403 }
    )
  }

  // ── 5. Load existing picks for this team ──────────────────────────────────
  const { data: existingPicks } = await supabase
    .from('draft_picks')
    .select('*, athlete:athletes(weight, seed)')
    .eq('team_id', activeTeam.id)

  // ── 6. Load undrafted athletes + wishlist ─────────────────────────────────
  const { data: athletes } = await supabase
    .from('athletes')
    .select('*')
    .eq('is_drafted', false)

  const { data: wishlist } = await supabase
    .from('draft_wishlist')
    .select('athlete_id, rank')
    .eq('team_id', activeTeam.id)
    .order('rank')

  if (!athletes || athletes.length === 0) {
    return NextResponse.json({ error: 'No available athletes' }, { status: 400 })
  }

  // ── 7. Select athlete ──────────────────────────────────────────────────────
  const selectedAthlete = selectAutoPickAthlete(
    wishlist ?? [],
    athletes as Athlete[],
    activeTeam.id,
    (existingPicks ?? []) as DraftPick[]
  )

  if (!selectedAthlete) {
    return NextResponse.json({ error: 'No eligible athletes found for autopick' }, { status: 400 })
  }

  const { round } = getPickMeta(currentPick)

  // ── 8. Insert the pick ────────────────────────────────────────────────────
  const { error: pickError } = await admin.from('draft_picks').insert({
    pick_number: currentPick,
    round,
    team_id: activeTeam.id,
    athlete_id: selectedAthlete.id,
    season_id: currentSeason?.id ?? null,
  })
  if (pickError) return NextResponse.json({ error: pickError.message }, { status: 500 })

  // Mark athlete as drafted
  await admin.from('athletes').update({ is_drafted: true }).eq('id', selectedAthlete.id)

  // ── 9. Advance draft state ────────────────────────────────────────────────
  const nextPick = currentPick + 1
  const isDraftComplete = nextPick > 100
  await admin.from('draft_settings').update({
    current_pick_number: isDraftComplete ? currentPick : nextPick,
    status: isDraftComplete ? 'complete' : 'active',
    pick_started_at: isDraftComplete ? null : new Date().toISOString(),
  }).eq('id', draftSettings.id)

  // ── 10. Chat message ──────────────────────────────────────────────────────
  const nextTeam = isDraftComplete ? null : getTeamForPick(nextPick, teams as Team[])
  const autoLabel = timerExpired ? '⏰ Auto-pick (timer expired)' : '🤖 Auto-pick'
  await admin.from('draft_chat_messages').insert({
    sender_name: 'Draft Bot',
    sender_role: 'system',
    is_system: true,
    message: `${autoLabel} — Pick #${currentPick} (R${round}): ${activeTeam.name} → ${selectedAthlete.name} (${selectedAthlete.weight} lbs, Seed #${selectedAthlete.seed}, ${selectedAthlete.school})${isDraftComplete ? ' — DRAFT COMPLETE!' : `\nOn the clock: ${nextTeam?.name}`}`,
  })

  // ── 11. SMS to next team (fire-and-forget) ────────────────────────────────
  if (!isDraftComplete && nextTeam) {
    ;(async () => {
      try {
        const { data: mgr } = await admin
          .from('teams').select('manager_id').eq('id', nextTeam.id).single()
        if (mgr?.manager_id) {
          const { data: mgProfile } = await admin
            .from('profiles').select('display_name, phone, sms_opt_in').eq('id', mgr.manager_id).single()
          if (mgProfile?.phone && mgProfile.sms_opt_in) {
            const name = mgProfile.display_name ?? 'Manager'
            await sendSms(
              mgProfile.phone,
              `🤼 ${name}, you're on the clock! ${nextTeam.name}'s pick #${nextPick} in the 5 on 2 Fantasy Wrestling Draft. https://5on2fantasywrestling.com/draft`
            )
          }
        }
      } catch (e) {
        console.error('[autopick] SMS error:', e)
      }
    })()
  }

  return NextResponse.json({
    success: true,
    pick_number: currentPick,
    team: activeTeam.name,
    athlete: selectedAthlete.name,
    source: timerExpired ? 'timer_expired' : 'auto_draft',
    draft_complete: isDraftComplete,
  })
}
