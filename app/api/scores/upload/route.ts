import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseScoreCSV, calcPlacementPoints } from '@/lib/scoring'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'commissioner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const contentType = req.headers.get('content-type') ?? ''
  let csvText: string

  if (contentType.includes('application/json')) {
    const body = await req.json()
    csvText = body.csv
  } else {
    csvText = await req.text()
  }

  if (!csvText) return NextResponse.json({ error: 'No CSV data provided' }, { status: 400 })

  const { rows, errors } = parseScoreCSV(csvText)

  if (errors.length > 0 && rows.length === 0) {
    return NextResponse.json({ error: 'CSV parsing failed', details: errors }, { status: 400 })
  }

  // Fetch all athletes to match by name
  const { data: athletes } = await supabase.from('athletes').select('id, name')
  const athleteMap = new Map((athletes ?? []).map((a) => [a.name.toLowerCase(), a.id]))

  const upserted: string[] = []
  const notFound: string[] = []

  for (const row of rows) {
    const athleteId = athleteMap.get(row.athlete_name.toLowerCase())
    if (!athleteId) {
      notFound.push(row.athlete_name)
      continue
    }

    const placementPoints = calcPlacementPoints(row.placement)

    const { error } = await supabase.from('scores').upsert({
      athlete_id: athleteId,
      event: row.event,
      championship_wins: row.championship_wins,
      consolation_wins: row.consolation_wins,
      bonus_points: row.bonus_points,
      placement: row.placement,
      placement_points: placementPoints,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'athlete_id,event' })

    if (!error) upserted.push(row.athlete_name)
  }

  return NextResponse.json({
    success: true,
    updated: upserted.length,
    not_found: notFound,
    parse_warnings: errors,
  })
}
