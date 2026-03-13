/**
 * Shared types and styling metadata for the per-user athlete flag system.
 * Flags are private to each user (enforced by Supabase RLS on athlete_flags table).
 */

export type FlagValue = 'stud' | 'ok' | 'pud'

export interface FlagMeta {
  label: string
  abbr: string
  /** Full-color classes when the flag IS active (button + row) */
  activeBtn: string
  /** Muted classes when a different flag is active or none is set */
  inactiveBtn: string
  /** Row/cell background tint when flagged */
  rowBg: string
  /** Row/cell border color when flagged */
  rowBorder: string
  /** Text color for the badge label */
  textColor: string
  /** Dot color for compact indicators */
  dotColor: string
}

export const FLAG_META: Record<FlagValue, FlagMeta> = {
  stud: {
    label: 'STUD',
    abbr: 'S',
    activeBtn:   'bg-green-500 text-white border-green-400 shadow-green-500/30 shadow-sm',
    inactiveBtn: 'bg-gray-900 border-gray-700 text-green-700 hover:text-green-400 hover:border-green-700',
    rowBg:     'bg-green-900/40',
    rowBorder: 'border-green-600',
    textColor: 'text-green-400',
    dotColor:  'bg-green-500',
  },
  ok: {
    label: 'OK',
    abbr: 'O',
    activeBtn:   'bg-yellow-400 text-gray-900 border-yellow-300 shadow-yellow-400/30 shadow-sm',
    inactiveBtn: 'bg-gray-900 border-gray-700 text-yellow-700 hover:text-yellow-400 hover:border-yellow-700',
    rowBg:     'bg-yellow-900/35',
    rowBorder: 'border-yellow-600',
    textColor: 'text-yellow-400',
    dotColor:  'bg-yellow-400',
  },
  pud: {
    label: 'PUD',
    abbr: 'P',
    activeBtn:   'bg-red-600 text-white border-red-500 shadow-red-600/30 shadow-sm',
    inactiveBtn: 'bg-gray-900 border-gray-700 text-red-800 hover:text-red-500 hover:border-red-800',
    rowBg:     'bg-red-900/40',
    rowBorder: 'border-red-600',
    textColor: 'text-red-400',
    dotColor:  'bg-red-500',
  },
}

export const FLAG_ORDER: FlagValue[] = ['stud', 'ok', 'pud']
