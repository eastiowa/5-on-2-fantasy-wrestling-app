'use client'

import { useState, useRef } from 'react'
import { BarChart3, Upload, Link2, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react'
import { generateScoreCSVTemplate } from '@/lib/scoring'

export default function ScoresPage() {
  const [csvText, setCsvText] = useState('')
  const [sheetsUrl, setSheetsUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => setCsvText(evt.target?.result as string)
    reader.readAsText(file)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-yellow-400" />
          Score Management
        </h1>
        <p className="text-gray-400 mt-1">
          Upload athlete results to update team scores. Uses NCAA Tournament scoring (Advancement + Bonus + Placement).
        </p>
      </div>

      {/* Result */}
      {result && (
        <div className="p-4 bg-green-950 border border-green-800 rounded-lg text-green-400 space-y-1">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="w-4 h-4" />
            Score update complete
          </div>
          <div className="text-sm">✓ Updated {result.updated} athletes</div>
          {result.not_found?.length > 0 && (
            <div className="text-sm text-yellow-400">
              ⚠️ Not matched: {result.not_found.join(', ')}
            </div>
          )}
          {result.parse_warnings?.length > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              Warnings: {result.parse_warnings.join('; ')}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* CSV Upload */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
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
          athlete_name, event, championship_wins, consolation_wins, bonus_points, placement
        </div>

        <div
          className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-yellow-400/50 transition-colors"
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

      {/* Google Sheets Sync */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
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

      {/* Scoring reference */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-3">
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
