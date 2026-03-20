'use client'

import { useState, useRef } from 'react'
import {
  BarChart3, Upload, AlertCircle, CheckCircle,
  Loader2, Download, BrainCircuit,
} from 'lucide-react'
import { generateScoreCSVTemplate } from '@/lib/scoring'

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScoresPage() {
  // CSV state
  const [csvText, setCsvText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Model data upload state
  const modelFileRef = useRef<HTMLInputElement>(null)
  const [modelUploading, setModelUploading] = useState(false)
  const [modelResult, setModelResult] = useState<any>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  // Shared result / error
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // ── CSV upload ─────────────────────────────────────────────────────────────
  function downloadTemplate() {
    const template = generateScoreCSVTemplate()
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'scores_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleCSVUpload() {
    if (!csvText.trim()) return
    setUploading(true)
    setError(null)
    setResult(null)
    const res = await fetch('/api/scores/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: csvText }),
    })
    const data = await res.json()
    setUploading(false)
    if (!res.ok) setError(data.error)
    else setResult(data)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => setCsvText(evt.target?.result as string)
    reader.readAsText(file)
  }

  // ── Model data CSV upload ──────────────────────────────────────────────────
  async function handleModelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setModelUploading(true)
    setModelError(null)
    setModelResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/projections/upload-model', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) setModelError(data.error ?? 'Upload failed')
      else setModelResult(data)
    } catch {
      setModelError('Network error — try again.')
    }
    setModelUploading(false)
    // reset input so the same file can be re-uploaded
    if (modelFileRef.current) modelFileRef.current.value = ''
  }

  // ── Shared result banner ───────────────────────────────────────────────────
  const ResultBanner = result ? (
    <div className="p-4 bg-green-950 border border-green-800 rounded-lg text-green-400 space-y-1">
      <div className="flex items-center gap-2 font-medium">
        <CheckCircle className="w-4 h-4" />
        Score update complete
      </div>
      <div className="text-sm">✓ Updated {result.updated} athletes
        {result.weight_classes_processed != null && ` across ${result.weight_classes_processed} weight classes`}
      </div>
      {result.not_found?.length > 0 && (
        <div className="text-sm text-yellow-400">
          ⚠️ Not matched: {result.not_found.join(', ')}
        </div>
      )}
      {(result.warnings?.length > 0 || result.parse_warnings?.length > 0) && (
        <div className="text-xs text-gray-400 mt-1">
          Warnings: {[...(result.warnings ?? []), ...(result.parse_warnings ?? [])].join('; ')}
        </div>
      )}
    </div>
  ) : null

  const ErrorBanner = error ? (
    <div className="flex items-center gap-2 p-4 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
      <AlertCircle className="w-4 h-4 shrink-0" />
      {error}
    </div>
  ) : null

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <BarChart3 className="w-8 h-8 text-yellow-400 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold text-white">Score Management</h1>
        </div>
      </div>

      {ResultBanner}
      {ErrorBanner}

      {/* ── CSV Upload ───────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-yellow-400" />
            Upload CSV File
          </h3>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-1.5 text-xs text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            <Download className="w-3 h-3" />
            Download Template
          </button>
        </div>

        <div className="bg-gray-950 rounded-lg p-3 text-xs font-mono text-gray-400">
          name, team, weight, place, score
        </div>
        <p className="text-xs text-gray-500">
          Each upload <strong className="text-gray-300">overwrites</strong> all existing scores — upload the latest cumulative totals and all team standings will update automatically.
        </p>

        <div
          className="border-2 border-dashed border-orange-600/40 rounded-lg p-6 text-center cursor-pointer hover:border-orange-500/70 transition-colors"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Click to select CSV file</p>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
        </div>

        {csvText && (
          <div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={8}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
            <button
              onClick={handleCSVUpload}
              disabled={uploading}
              className="mt-3 w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</> : 'Upload & Update Scores'}
            </button>
          </div>
        )}
      </div>

      {/* ── Prediction Model Upload ──────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-blue-500/30 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-blue-400" />
              Prediction Model Data
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Upload the pre-tournament Monte Carlo simulation CSV
              (<span className="font-mono text-xs text-gray-300">mc_full_results_2026.csv</span> format)
              to seed per-athlete placement probabilities and win-probability projections.
              Expected columns: <span className="font-mono text-xs text-gray-300">
                name, weight, seed, ws_elo, mc_p1–mc_p8, mc_expected_points, bonus_rate
              </span>.
            </p>
          </div>
        </div>

        {/* Result */}
        {modelResult && (
          <div className="p-3 bg-blue-950 border border-blue-800 rounded-lg text-blue-300 space-y-1 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4" />
              Model data uploaded — {modelResult.inserted} athletes processed
            </div>
            <div>✓ Matched to roster: {modelResult.matched}</div>
            {modelResult.unmatched?.length > 0 && (
              <div className="text-yellow-400">
                ⚠️ Unmatched ({modelResult.unmatched.length}): {modelResult.unmatched.slice(0, 8).join(', ')}
                {modelResult.unmatched.length > 8 && ` +${modelResult.unmatched.length - 8} more`}
              </div>
            )}
            {modelResult.db_errors?.length > 0 && (
              <div className="text-red-400 text-xs">
                DB errors: {modelResult.db_errors.join('; ')}
              </div>
            )}
          </div>
        )}
        {modelError && (
          <div className="flex items-center gap-2 p-3 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {modelError}
          </div>
        )}

        {/* Upload button */}
        <input
          ref={modelFileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleModelUpload}
        />
        <button
          onClick={() => modelFileRef.current?.click()}
          disabled={modelUploading}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white font-semibold rounded-lg transition-colors text-sm"
        >
          {modelUploading
            ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</>
            : <><Upload className="w-4 h-4" />Upload Simulation CSV</>
          }
        </button>
      </div>

      {/* ── Scoring reference ────────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6 space-y-3">
        <h3 className="font-semibold text-white">NCAA Scoring Reference</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-yellow-400 font-medium mb-1">Advancement</div>
            <div className="text-gray-400">Championship win: 1.0 pt</div>
            <div className="text-gray-400">Consolation win: 0.5 pts</div>
          </div>
          <div>
            <div className="text-yellow-400 font-medium mb-1">Bonus</div>
            <div className="text-gray-400">Fall/Forfeit: +2.0 pts</div>
            <div className="text-gray-400">Tech Fall: +1.5 pts</div>
            <div className="text-gray-400">Major Dec: +1.0 pts</div>
          </div>
          <div>
            <div className="text-yellow-400 font-medium mb-1">Placement</div>
            <div className="text-gray-400">1st: 16 · 2nd: 12 · 3rd: 10</div>
            <div className="text-gray-400">4th: 9 · 5th: 7 · 6th: 6</div>
            <div className="text-gray-400">7th: 4 · 8th: 3 pts</div>
          </div>
        </div>
      </div>
    </div>
  )
}
