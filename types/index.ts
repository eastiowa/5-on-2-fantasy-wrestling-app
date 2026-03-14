export type UserRole = 'commissioner' | 'team_manager'

export type DraftStatus = 'pending' | 'active' | 'paused' | 'complete'

export type SeasonStatus = 'setup' | 'drafting' | 'active' | 'complete'

export type WinType = 'decision' | 'major_decision' | 'tech_fall' | 'fall' | 'forfeit' | 'default' | 'disqualification'

export const WEIGHT_CLASSES = [125, 133, 141, 149, 157, 165, 174, 184, 197, 285] as const
export type WeightClass = typeof WEIGHT_CLASSES[number]

export const PLACEMENT_POINTS: Record<number, number> = {
  1: 16,
  2: 12,
  3: 10,
  4: 9,
  5: 7,
  6: 6,
  7: 4,
  8: 3,
}

export const BONUS_POINTS: Record<WinType, number> = {
  decision: 0,
  major_decision: 1,
  tech_fall: 1.5,
  fall: 2,
  forfeit: 2,
  default: 2,
  disqualification: 2,
}

// ============================================================
// SEASON
// One row per annual league year. Exactly one may be is_current.
// ============================================================
export interface Season {
  id: string
  year: number            // e.g. 2025
  label: string           // e.g. "2024-25 Season"
  status: SeasonStatus
  is_current: boolean
  created_at: string
}

// ============================================================
// TEAM SEASON
// Per-season metadata for each persistent franchise:
// draft order, final placement, points snapshot.
// ============================================================
export interface TeamSeason {
  id: string
  team_id: string
  season_id: string
  draft_position: number | null   // 1–10, set by commissioner before draft
  final_placement: number | null  // 1–10, written when season is archived
  total_points: number            // snapshot at season end
  created_at: string
  // joined
  team?: Team
  season?: Season
}

export interface Profile {
  id: string
  email: string
  role: UserRole
  team_id: string | null
  display_name: string | null
  created_at: string
}

// Teams are persistent franchises — they exist across all seasons.
// draft_position is now per-season via TeamSeason.
export interface Team {
  id: string
  name: string
  manager_id: string | null
  created_at: string
  // joined
  manager?: Profile
  total_points?: number           // current-season running total
  draft_position?: number | null  // current-season draft position (from team_seasons join)
  // history
  team_seasons?: TeamSeason[]
}

// Athletes are season-specific — uploaded fresh each year.
export interface Athlete {
  id: string
  season_id: string
  name: string
  weight: WeightClass
  school: string
  seed: number
  is_drafted: boolean
  created_at: string
  // joined
  total_points?: number
  drafted_by_team?: string
}

// One draft_settings row per season (keyed by season_id).
export interface DraftSettings {
  id: string
  season_id: string
  status: DraftStatus
  current_pick_number: number
  pick_timer_seconds: number
  pick_started_at: string | null
  auto_skip_on_timeout: boolean
  snake_enabled: boolean
  draft_start_date: string | null   // ISO timestamp — drives the countdown
  created_at: string
}

export interface DraftPick {
  id: string
  season_id: string
  pick_number: number
  round: number
  team_id: string
  athlete_id: string
  picked_at: string
  // joined
  team?: Team
  athlete?: Athlete
}

export interface Score {
  id: string
  season_id: string
  athlete_id: string
  event: string
  championship_wins: number
  consolation_wins: number
  bonus_points: number
  placement: number | null
  placement_points: number
  total_points: number
  updated_at: string
  // joined
  athlete?: Athlete
}

export interface Announcement {
  id: string
  season_id: string | null  // null = global / permanently pinned
  title: string
  body: string
  created_by: string
  created_at: string
  // joined
  creator?: Profile
}

export interface WishlistItem {
  id: string
  season_id: string
  team_id: string
  athlete_id: string
  rank: number
  created_at: string
  // joined
  athlete?: Athlete
}

export interface ChatMessage {
  id: string
  season_id: string
  sender_id: string | null
  sender_name: string
  sender_role: UserRole | 'system'
  message: string
  is_system: boolean
  is_pinned: boolean
  created_at: string
}

// Current-season standings row
export interface Standing {
  rank: number
  team: Team
  season_id: string
  total_points: number
  athletes_drafted: number
}

// Historical standings for a completed season
export interface SeasonStanding {
  season: Season
  team: Team
  final_placement: number
  total_points: number
}

// Snake draft helper type
export interface CurrentPickInfo {
  pick_number: number
  round: number
  team_id: string
  team_name: string
  is_my_turn: boolean
}
