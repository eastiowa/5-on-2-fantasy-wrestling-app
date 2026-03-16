'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  BarChart3, Upload, Link2, AlertCircle, CheckCircle,
  Loader2, Download, Zap, ToggleLeft, ToggleRight, RefreshCw, Clock, BrainCircuit,
} from 'lucide-react'
import { generateScoreCSVTemplate } from '@/lib/scoring'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScrapeSettings {
  trackwrestling_url: string | null
  auto_scrape_enabled: boolean
  last_scraped_at: string | null
  last_scrape_status: 'idle' | 'ok' | 'error'
  last_scrape_message: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScoresPage() {
  const supabase = createClient()

  // CSV state
  const [csvText, setCsvText] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Google Sheets state
  const [sheetsUrl, setSheetsUrl] = useState('')
  const [syncing, setSyncing] = useState(false)

  // TrackWrestling state
  const [scrapeSettings, setScrapeSettings] = useState<ScrapeSettings | null>(null)
  const [twUrl, setTwUrl] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [togglingAuto, setTogglingAuto] = useState(false)
  const [scraping, setScraping] = useState(false)

  // Model data upload state
  const modelFileRef = useRef<HTMLInputElement>(null)
  const [modelUploading, setModelUploading] = useState(false)
  const [modelResult, setModelResult] = useState<any>(null)
  const [modelError, setModelError] = useState<string | null>(null)

  // Shared result / error
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // ── Load scrape_settings on mount + subscribe to realtime updates ──────────
  const loadScrapeSettings = useCallback(async () => {
    const { data } = await supabase.from('scrape_settings').select('*').single()
    if (data) {
      setScrapeSettings(data as ScrapeSettings)
      setTwUrl(data.trackwrestling_url ?? '')
    }
  }, [supabase])

  useEffect(() => {
    loadScrapeSettings()

    const channel = supabase
      .channel('scrape_settings_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'scrape_settings' },
        (payload) => {
          setScrapeSettings(payload.new as ScrapeSettings)
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadScrapeSettings, supabase])

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

  // ── Google Sheets sync ─────────────────────────────────────────────────────
  async function handleSheetsSync() {
    if (!sheetsUrl.trim()) return
    setSyncing(true)
    setError(null)
    setResult(null)
    const res = await fetch('/api/scores/sync-sheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet_url: sheetsUrl }),
    })
    const data = await res.json()
    setSyncing(false)
    if (!res.ok) setError(data.error)
    else setResult(data)
  }

  // ── TrackWrestling: save URL ───────────────────────────────────────────────
  async function handleSaveUrl() {
    if (!twUrl.trim()) return
    setSavingUrl(true)
    setError(null)
    const { error: err } = await supabase
      .from('scrape_settings')
      .update({
        trackwrestling_url: twUrl.trim(),
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000')
    setSavingUrl(false)
    if (err) setError(`Failed to save URL: ${err.message}`)
    else await loadScrapeSettings()
  }

  // ── TrackWrestling: toggle auto-sync ───────────────────────────────────────
  async function handleToggleAuto() {
    if (!scrapeSettings) return
    setTogglingAuto(true)
    const newVal = !scrapeSettings.auto_scrape_enabled
    const { error: err } = await supabase
      .from('scrape_settings')
      .update({ auto_scrape_enabled: newVal, updated_at: new Date().toISOString() })
      .neq('id', '00000000-0000-0000-0000-000000000000')
    setTogglingAuto(false)
    if (err) setError(`Failed to toggle auto-sync: ${err.message}`)
  }

  // ── TrackWrestling: manual scrape ──────────────────────────────────────────
  async function handleScrapeNow() {
    setScraping(true)
    setError(null)
    setResult(null)
    const body: Record<string, string> = {}
    if (twUrl.trim() && twUrl.trim() !== scrapeSettings?.trackwrestling_url) {
      body.tournament_url = twUrl.trim()
    }
    const res = await fetch('/api/scores/scrape-trackwrestling', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setScraping(false)
    if (!res.ok) setError(data.error ?? 'Scrape failed')
    else setResult(data)
    await loadScrapeSettings()
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

  // ── Status badge for last scrape ───────────────────────────────────────────
  function ScrapeStatusBadge() {
    if (!scrapeSettings?.last_scraped_at) {
      return <span className="text-xs text-gray-500">Never synced</span>
    }
    const ago = formatDistanceToNow(new Date(scrapeSettings.last_scraped_at), { addSuffix: true })
    const isOk = scrapeSettings.last_scrape_status === 'ok'
    return (
      <div className="flex flex-col gap-0.5">
        <div className={`flex items-center gap-1.5 text-xs font-medium ${isOk ? 'text-green-400' : 'text-red-400'}`}>
          {isOk
            ? <CheckCircle className="w-3.5 h-3.5" />
            : <AlertCircle className="w-3.5 h-3.5" />}
          {isOk ? 'Synced' : 'Error'} · {ago}
        </div>
        {scrapeSettings.last_scrape_message && (
          <div className="text-xs text-gray-500 truncate max-w-xs">
            {scrapeSettings.last_scrape_message}
          </div>
        )}
      </div>
    )
  }

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

      {/* ── TrackWrestling Live Sync ─────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-yellow-400/30 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              TrackWrestling Live Sync
              <span className="text-xs bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 rounded px-1.5 py-0.5 font-normal">
                LIVE
              </span>
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Paste the tournament bracket URL and scores will be fetched directly
              from TrackWrestling and pushed to all league members in real time.
            </p>
          </div>
          <ScrapeStatusBadge />
        </div>

        {/* URL input + Save */}
        <div className="flex gap-2">
          <input
            type="url"
            value={twUrl}
            onChange={(e) => setTwUrl(e.target.value)}
            placeholder="https://www.trackwrestling.com/tw/public/tournaments/TournamentBrackets.jsp?TIM=..."
            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
          />
          <button
            onClick={handleSaveUrl}
            disabled={savingUrl || !twUrl.trim()}
            className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700/50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
          >
            {savingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save URL'}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Sync Now button */}
          <button
            onClick={handleScrapeNow}
            disabled={scraping || (!twUrl.trim() && !scrapeSettings?.trackwrestling_url)}
            className="flex-1 py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {scraping
              ? <><Loader2 className="w-4 h-4 animate-spin" />Scraping…</>
              : <><RefreshCw className="w-4 h-4" />Sync Now</>}
          </button>

          {/* Auto-sync toggle */}
          <button
            onClick={handleToggleAuto}
            disabled={togglingAuto || !scrapeSettings?.trackwrestling_url}
            className={`flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 ${
              scrapeSettings?.auto_scrape_enabled
                ? 'bg-green-700 hover:bg-green-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {togglingAuto
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : scrapeSettings?.auto_scrape_enabled
                ? <ToggleRight className="w-4 h-4" />
                : <ToggleLeft className="w-4 h-4" />}
            Auto-sync {scrapeSettings?.auto_scrape_enabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* cron-job.org setup hint */}
        <div className="bg-gray-800/60 rounded-lg p-4 text-xs text-gray-400 space-y-1.5">
          <div className="flex items-center gap-1.5 text-gray-300 font-medium">
            <Clock className="w-3.5 h-3.5" />
            Automated polling via cron-job.org (free)
          </div>
          <p>
            Create a free job at{' '}
            <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer"
              className="text-yellow-400 hover:underline">cron-job.org</a>{' '}
            pointing to:
          </p>
          <code className="block bg-gray-900 rounded px-3 py-1.5 text-gray-300 break-all">
            POST {typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.vercel.app'}
            /api/scores/scrape-trackwrestling
          </code>
          <p>Add a request header: <code className="text-gray-300">x-cron-secret</code> → your <code className="text-gray-300">CRON_SECRET</code> env value. Set schedule to every 2 minutes during tournament weekends.</p>
        </div>
      </div>

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

      {/* ── Google Sheets Sync ───────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6 space-y-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Link2 className="w-4 h-4 text-yellow-400" />
          Sync from Google Sheets
        </h3>
        <p className="text-sm text-gray-400">
          Paste a Google Sheet URL. The sheet must be shared with your service account and use the same column format.
        </p>
        <input
          type="url"
          value={sheetsUrl}
          onChange={(e) => setSheetsUrl(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-yellow-400"
        />
        <button
          onClick={handleSheetsSync}
          disabled={syncing || !sheetsUrl.trim()}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {syncing ? <><Loader2 className="w-4 h-4 animate-spin" />Syncing…</> : 'Sync Now'}
        </button>
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
