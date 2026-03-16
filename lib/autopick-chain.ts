import type { SupabaseClient } from '@supabase/supabase-js'
import { getTeamForPick, getPickMeta, selectAutoPickAthlete } from '@/lib/draft-logic'
import { sendSms } from '@/lib/twilio'
import type { Team, Athlete, DraftPick } from '@/types'

interface ChainedPick {
  pick_number: number
  team_name: string
  athlete_name: string
}

interface AutoDraftChainResult {
  picks: ChainedPick[]
  draft_complete: boolean
  /** The team now on the clock after the chain (null if draft complete). */
  next_team: { id: string; name: string; manager_id?: string | null } | null
  next_pick_number: number | null
}

type TeamRow = {
  id: string
  name: string
  draft_position: number | null
  auto_draft?: boolean | null
  manager_id?: string | null
}

/**
 * After any pick is committed and `draft_settings` is already advanced to
 * `startPickNumber`, this function checks if the team now on the clock has
 * `auto_draft = true`.  If so it picks for them immediately (server-side),
 * advances the counter, and repeats — until either:
 *   • the team on the clock does NOT have auto_draft, or
 *   • the draft is complete (100 picks done).
 *
 * All writes use the admin client to bypass RLS.
 *
 * Returns a summary of every chained pick made plus who is on the clock next.
 */
export async function runAutoDraftChain(
  admin: SupabaseClient,
  startPickNumber: number,
  teams: TeamRow[],
  draftSettingsId: string,
  seasonId: string | null,
): Promise<AutoDraftChainResult> {
  const result: AutoDraftChainResult = {
    picks: [],
    draft_complete: false,
    next_team: null,
    next_pick_number: null,
  }

  let currentPick = startPickNumber

  // Safety cap — can never chain more picks than teams × rounds
  for (let i = 0; i < 100; i++) {
    if (currentPick > 100) {
      result.draft_complete = true
      break
    }

    const activeTeam = getTeamForPick(currentPick, teams as Team[])
    const teamRow = teams.find((t) => t.id === activeTeam.id)

    if (!teamRow?.auto_draft) {
      // This team does not have autodraft — stop chaining
      result.next_team = { id: activeTeam.id, name: activeTeam.name, manager_id: teamRow?.manager_id }
      result.next_pick_number = currentPick
      break
    }

    // ── Load fresh data for this iteration ─────────────────────────────────
    const { data: athletes } = await admin
      .from('athletes')
      .select('*')
      .eq('is_drafted', false)

    if (!athletes || athletes.length === 0) {
      result.next_team = { id: activeTeam.id, name: activeTeam.name, manager_id: teamRow.manager_id }
      result.next_pick_number = currentPick
      break
    }

    const { data: existingPicks } = await admin
      .from('draft_picks')
      .select('*, athlete:athletes(weight, seed)')
      .eq('team_id', activeTeam.id)

    const { data: wishlist } = await admin
      .from('draft_wishlist')
      .select('athlete_id, rank')
      .eq('team_id', activeTeam.id)
      .order('rank')

    const selectedAthlete = selectAutoPickAthlete(
      wishlist ?? [],
      athletes as Athlete[],
      activeTeam.id,
      (existingPicks ?? []) as DraftPick[],
    )

    if (!selectedAthlete) {
      console.warn(`[autodraft-chain] No eligible athlete for team ${activeTeam.name} at pick #${currentPick}`)
      result.next_team = { id: activeTeam.id, name: activeTeam.name, manager_id: teamRow.manager_id }
      result.next_pick_number = currentPick
      break
    }

    const { round } = getPickMeta(currentPick)

    // ── Insert pick ─────────────────────────────────────────────────────────
    const { error: pickErr } = await admin.from('draft_picks').insert({
      pick_number: currentPick,
      round,
      team_id: activeTeam.id,
      athlete_id: selectedAthlete.id,
      season_id: seasonId,
    })
    if (pickErr) {
      console.error(`[autodraft-chain] insert error at pick #${currentPick}:`, pickErr.message)
      break
    }

    await admin.from('athletes').update({ is_drafted: true }).eq('id', selectedAthlete.id)

    // ── Advance draft state ─────────────────────────────────────────────────
    const nextPick = currentPick + 1
    const isDraftComplete = nextPick > 100

    await admin.from('draft_settings').update({
      current_pick_number: isDraftComplete ? currentPick : nextPick,
      status: isDraftComplete ? 'complete' : 'active',
      pick_started_at: isDraftComplete ? null : new Date().toISOString(),
    }).eq('id', draftSettingsId)

    // ── Chat message ────────────────────────────────────────────────────────
    const nextTeamObj = isDraftComplete ? null : getTeamForPick(nextPick, teams as Team[])
    await admin.from('draft_chat_messages').insert({
      sender_name: 'Draft Bot',
      sender_role: 'system',
      is_system: true,
      message:
        `🤖 Auto-pick — Pick #${currentPick} (R${round}): ${activeTeam.name} → ` +
        `${selectedAthlete.name} (${selectedAthlete.weight} lbs, Seed #${selectedAthlete.seed}, ${selectedAthlete.school})` +
        `${isDraftComplete ? ' — DRAFT COMPLETE!' : `\nOn the clock: ${nextTeamObj?.name}`}`,
    })

    result.picks.push({
      pick_number: currentPick,
      team_name: activeTeam.name,
      athlete_name: selectedAthlete.name,
    })

    if (isDraftComplete) {
      result.draft_complete = true
      break
    }

    currentPick = nextPick
  }

  return result
}

/**
 * After the chain runs, send an SMS to the manager of whoever is now on the
 * clock (if they have sms_opt_in and are not on autodraft themselves).
 * Fire-and-forget — safe to call without awaiting.
 */
export async function notifyNextTeam(
  admin: SupabaseClient,
  chainResult: AutoDraftChainResult,
  pickNumber: number,
): Promise<void> {
  if (chainResult.draft_complete || !chainResult.next_team) return

  const nextTeam = chainResult.next_team
  const nextPick = chainResult.next_pick_number ?? pickNumber

  try {
    const { data: mgr } = await admin
      .from('teams')
      .select('manager_id')
      .eq('id', nextTeam.id)
      .single()

    if (!mgr?.manager_id) return

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, phone, sms_opt_in')
      .eq('id', mgr.manager_id)
      .single()

    if (profile?.phone && profile.sms_opt_in) {
      const name = profile.display_name ?? 'Manager'
      await sendSms(
        profile.phone,
        `🤼 ${name}, you're on the clock! ${nextTeam.name}'s pick #${nextPick} in the 5 on 2 Fantasy Wrestling Draft. https://5on2fantasywrestling.com/draft`,
      )
    }
  } catch (e) {
    console.error('[autodraft-chain] SMS notify error:', e)
  }
}
