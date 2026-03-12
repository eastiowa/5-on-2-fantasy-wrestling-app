'use client'

export function DeleteAthleteButton({ athleteId }: { athleteId: string }) {
  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault()
    if (!confirm('Remove this athlete?')) return
    const res = await fetch(`/api/athletes/${athleteId}`, { method: 'DELETE' })
    if (res.ok) window.location.reload()
  }

  return (
    <button
      onClick={handleDelete}
      className="text-xs text-red-400 hover:text-red-300 transition-colors"
    >
      Remove
    </button>
  )
}
