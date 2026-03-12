import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
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

  // ── Resolve current season ──────────────────────────────────────────────────
  const { data: currentSeason } = await supabase
    .from('seasons')
    .select('id, label')
    .eq('is_current', true)
    .maybeSingle()

  if (!currentSeason) {
    return NextResponse.json(
      { error: 'No active season set. Create a season and mark it as current before uploading athletes.' },
      { status: 400 }
    )
  }

  // ── Validate payload ────────────────────────────────────────────────────────
  const body = await req.json()
  const athletes: { name: string; weight: number; school: string; seed: number }[] = body.athletes

  if (!Array.isArray(athletes) || athletes.length === 0) {
    return NextResponse.json({ error: 'No athletes provided' }, { status: 400 })
  }

  const VALID_WEIGHTS = new Set([125, 133, 141, 149, 157, 165, 174, 184, 197, 285])
  const validated = athletes
    .filter((a) => a.name && VALID_WEIGHTS.has(a.weight) && a.school && a.seed > 0)
    .map((a) => ({ ...a, season_id: currentSeason.id }))   // ← stamp season

  if (validated.length === 0) {
    return NextResponse.json({ error: 'No valid athletes in payload' }, { status: 400 })
  }

  // ── Skip athletes already in this season (avoids needing a unique DB constraint) ──
  const { data: existing } = await supabase
    .from('athletes')
    .select('name, weight')
    .eq('season_id', currentSeason.id)

  const existingKeys = new Set(
    (existing ?? []).map((a) => `${a.name.toLowerCase()}|${a.weight}`)
  )

  const newAthletes = validated.filter(
    (a) => !existingKeys.has(`${a.name.toLowerCase()}|${a.weight}`)
  )

  const skipped = validated.length - newAthletes.length

  if (newAthletes.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, season: currentSeason.label })
  }

  const { data, error } = await supabase
    .from('athletes')
    .insert(newAthletes)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    inserted: data?.length ?? 0,
    skipped,
    season: currentSeason.label,
  })
}
