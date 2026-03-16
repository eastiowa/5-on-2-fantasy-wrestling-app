import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getTeamForPick, getPickMeta, validatePick } from '@/lib/draft-logic'
import { runAutoDraftChain, notifyNextTeam } from '@/lib/autopick-chain'
import { Team, Athlete, DraftPick } from '@/types'
import { sendSms } from '@/lib/twilio'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { athlete_id } = await req.json()
  if (!athlete_id) return NextResponse.json({ error: 'athlete_id is required' }, { status: 400 })

  // Get profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, team_id')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Get draft settings
  const { data: draftSettings } = await supabase
    .from('draft_settings')
    .select('*')
    .single()

  if (!draftSettings) return NextResponse.json({ error: 'Draft not configured' }, { status: 400 })
  if (draftSettings.status !== 'active') {
    return NextResponse.json({ error: `Draft is ${draftSettings.status}` }, { status: 400 })
  }

  // Get teams with draft_position from current season's team_seasons
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

  // Determine whose turn it is
  const currentPick = draftSettings.current_pick_number
  const activeTeam = getTeamForPick(currentPick, teams as Team[])

  // Verify the user's team is the active team (unless commissioner)
  if (profile.role !== 'commissioner' && profile.team_id !== activeTeam.id) {
    return NextResponse.json({
      error: `It is not your turn. Currently picking: ${activeTeam.name}`
    }, { status: 403 })
  }

  const teamId = profile.role === 'commissioner'
    ? activeTeam.id  // commissioner picks on behalf of active team
    : profile.team_id

  // Get the athlete
  const { data: athlete } = await supabase
    .from('athletes')
    .select('*')
    .eq('id', athlete_id)
    .single()

  if (!athlete) return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })

  // Get existing picks for this team with athlete info
  const { data: existingPicks } = await supabase
    .from('draft_picks')
    .select('*, athlete:athletes(weight, seed)')
    .eq('team_id', teamId)

  // Validate the pick
  const validationError = validatePick(
    athlete as Athlete,
    { id: teamId } as Team,
    (existingPicks ?? []) as DraftPick[]
  )

  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 })
  }

  const { round } = getPickMeta(currentPick)

  // Insert the pick in a transaction
  // Use the admin client for all privileged writes so team_managers can
  // trigger them. The regular session client is blocked by RLS for:
  //   • athletes UPDATE  (commissioner-only policy)
  //   • draft_settings UPDATE  (commissioner-only policy)
  const admin = createAdminClient()

  const { error: pickError } = await admin
    .from('draft_picks')
    .insert({
      pick_number: currentPick,
      round,
      team_id: teamId,
      athlete_id,
      // Always tag with the current season so dashboard season-filtered queries match
      season_id: currentSeason?.id ?? null,
    })

  if (pickError) return NextResponse.json({ error: pickError.message }, { status: 500 })

  // Mark athlete as drafted (commissioner-only UPDATE policy → must use admin)
  const { error: athleteErr } = await admin
    .from('athletes')
    .update({ is_drafted: true })
    .eq('id', athlete_id)
  if (athleteErr) console.error('[draft/pick] athlete update error:', athleteErr.message)

  // Check if draft is complete (100 picks total)
  const nextPick = currentPick + 1
  const isDraftComplete = nextPick > 100

  // Advance pick counter / mark complete (commissioner-only UPDATE → must use admin)
  const { error: settingsErr } = await admin
    .from('draft_settings')
    .update({
      current_pick_number: isDraftComplete ? currentPick : nextPick,
      status: isDraftComplete ? 'complete' : 'active',
      pick_started_at: isDraftComplete ? null : new Date().toISOString(),
    })
    .eq('id', draftSettings.id)
  if (settingsErr) console.error('[draft/pick] draft_settings update error:', settingsErr.message)

  // Post a system chat message
  const nextTeam = isDraftComplete ? null : getTeamForPick(nextPick, teams as Team[])
  await admin.from('draft_chat_messages').insert({
    sender_name: 'Draft Bot',
    sender_role: 'system',
    is_system: true,
    message: `Pick #${currentPick} (${round === 1 ? 'R1' : `R${round}`}): ${activeTeam.name} selected ${athlete.name} (${athlete.weight} lbs, Seed #${athlete.seed}, ${athlete.school})${isDraftComplete ? ' — DRAFT COMPLETE!' : `\nOn the clock: ${nextTeam?.name}`}`,
  })

  // ── Server-side autodraft chain + SMS (fire-and-forget) ───────────────────
  // If the next team has auto_draft=true, pick for them immediately on the
  // server — no browser required. Then notify whoever ends up on the clock.
  if (!isDraftComplete) {
    ;(async () => {
      try {
        const nextTeamRow = teams.find((t) => t.id === nextTeam?.id)
        if (nextTeamRow?.auto_draft) {
          // Chain picks for all consecutive autodraft teams
          const chainResult = await runAutoDraftChain(
            admin,
            nextPick,
            teams,
            draftSettings.id,
            currentSeason?.id ?? null,
          )
          // SMS whoever is now on the clock (skips autodraft teams)
          await notifyNextTeam(admin, chainResult, nextPick)
        } else {
          // Next team is manual — just send the regular SMS
          if (!nextTeam) return
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
        }
      } catch (smsErr) {
        console.error('[draft/pick] post-pick notify error:', smsErr)
      }
    })()
  }

  return NextResponse.json({
    success: true,
    pick_number: currentPick,
    team: activeTeam.name,
    athlete: athlete.name,
    draft_complete: isDraftComplete,
  })
}
