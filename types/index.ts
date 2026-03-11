export type UserRole = 'commissioner' | 'team_manager'

export type DraftStatus = 'pending' | 'active' | 'paused' | 'complete'

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

export interface Profile {
  id: string
  email: string
  role: UserRole
  team_id: string | null
  display_name: string | null
  created_at: string
}

export interface Team {
  id: string
  name: string
  manager_id: string | null
  draft_position: number | null
  created_at: string
  // joined
  manager?: Profile
  total_points?: number
}

export interface Athlete {
  id: string
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

export interface DraftSettings {
  id: string
  status: DraftStatus
  current_pick_number: number
  pick_timer_seconds: number
  pick_started_at: string | null
  auto_skip_on_timeout: boolean
  snake_enabled: boolean
  created_at: string
}

export interface DraftPick {
  id: string
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
  title: string
  body: string
  created_by: string
  created_at: string
  // joined
  creator?: Profile
}

export interface WishlistItem {
  id: string
  team_id: string
  athlete_id: string
  rank: number
  created_at: string
  // joined
  athlete?: Athlete
}

export interface ChatMessage {
  id: string
  sender_id: string | null
  sender_name: string
  sender_role: UserRole | 'system'
  message: string
  is_system: boolean
  is_pinned: boolean
  created_at: string
}

export interface Standing {
  rank: number
  team: Team
  total_points: number
  athletes_drafted: number
}

// Snake draft helper type
export interface CurrentPickInfo {
  pick_number: number
  round: number
  team_id: string
  team_name: string
  is_my_turn: boolean
}
