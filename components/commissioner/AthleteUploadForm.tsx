'use client'

import { useState, useRef } from 'react'
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react'
import Papa from 'papaparse'

interface PreviewRow {
  name: string
  weight: string
  school: string
  seed: string
  error?: string
}

const VALID_WEIGHTS = new Set([125, 133, 141, 149, 157, 165, 174, 184, 197, 285])

export function AthleteUploadForm() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: number; season?: string } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setUploadError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      // Strip BOM (\ufeff) added by Excel — it corrupts the first column header
      const text = (evt.target?.result as string).replace(/^\ufeff/, '')

      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/^\ufeff/, ''),
      })

      const rows: PreviewRow[] = []
      const errors: string[] = []

      // Surface a helpful message if expected columns are missing entirely
      const foundHeaders = parsed.meta.fields ?? []
      const required = ['name', 'weight', 'school', 'seed']
      const missing = required.filter((c) => !foundHeaders.includes(c))
      if (missing.length > 0) {
        errors.push(
          `CSV column(s) not found: ${missing.join(', ')}. ` +
          `Found: ${foundHeaders.join(', ')}. ` +
          `Expected headers: name, weight, school, seed`
        )
        setPreview([])
        setParseErrors(errors)
        return
      }

      parsed.data.forEach((row, i) => {
        const lineNum = i + 2
        const name = row.name?.trim()
        const weightStr = row.weight?.trim()
        const school = row.school?.trim()
        const seedStr = row.seed?.trim()

        if (!name) { errors.push(`Row ${lineNum}: missing name`); return }
        if (!school) { errors.push(`Row ${lineNum}: missing school`); return }

        const weight = Number(weightStr)
        const seed = Number(seedStr)

        let rowError: string | undefined
        if (!VALID_WEIGHTS.has(weight)) {
          rowError = `Invalid weight: ${weightStr}`
        } else if (isNaN(seed) || seed <= 0) {
          rowError = `Invalid seed: ${seedStr}`
        }

        rows.push({ name, weight: weightStr, school, seed: seedStr, error: rowError })
      })

      setPreview(rows)
      setParseErrors(errors)
    }
    reader.readAsText(file)
  }

  async function handleUpload() {
    const validRows = preview.filter((r) => !r.error)
    if (validRows.length === 0) return

    setUploading(true)
    setUploadError(null)

    const res = await fetch('/api/athletes/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        athletes: validRows.map((r) => ({
          name: r.name,
          weight: Number(r.weight),
          school: r.school,
          seed: Number(r.seed),
        })),
      }),
    })

    const data = await res.json()
    setUploading(false)

    if (!res.ok) {
      setUploadError(data.error ?? 'Upload failed.')
    } else {
      setResult(data)
      setPreview([])
      setFileName(null)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const validCount = preview.filter((r) => !r.error).length
  const errorCount = preview.filter((r) => !!r.error).length

  return (
    <div className="bg-gray-900 rounded-xl border border-orange-600/20 p-6 space-y-4">
      <h3 className="font-semibold text-white">Upload Athlete CSV</h3>

      {/* File input */}
      <div
        className="border-2 border-dashed border-orange-600/40 rounded-lg p-8 text-center cursor-pointer hover:border-orange-500/70 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
        {fileName ? (
          <div className="flex items-center justify-center gap-2 text-yellow-400">
            <FileText className="w-4 h-4" />
            <span className="text-sm font-medium">{fileName}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setPreview([]); setFileName(null); if (fileRef.current) fileRef.current.value = '' }}
              className="text-gray-500 hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <p className="text-gray-400 text-sm">Click to select a CSV file</p>
            <p className="text-gray-600 text-xs mt-1">or drag and drop</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFile}
        />
      </div>

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-400 font-medium mb-2">
            <AlertCircle className="w-4 h-4" />
            Parse Errors
          </div>
          <ul className="text-sm text-red-300 space-y-1">
            {parseErrors.map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-400">{validCount} valid</span>
            {errorCount > 0 && <span className="text-red-400">{errorCount} with errors (will be skipped)</span>}
          </div>

          <div className="border border-gray-800 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 text-gray-400">Name</th>
                  <th className="text-left px-3 py-2 text-gray-400">Weight</th>
                  <th className="text-left px-3 py-2 text-gray-400">School</th>
                  <th className="text-left px-3 py-2 text-gray-400">Seed</th>
                  <th className="text-left px-3 py-2 text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {preview.map((row, i) => (
                  <tr key={i} className={row.error ? 'bg-red-950/30' : ''}>
                    <td className="px-3 py-2 text-white">{row.name}</td>
                    <td className="px-3 py-2 text-gray-300">{row.weight}</td>
                    <td className="px-3 py-2 text-gray-300">{row.school}</td>
                    <td className="px-3 py-2 text-gray-300">#{row.seed}</td>
                    <td className="px-3 py-2">
                      {row.error
                        ? <span className="text-red-400">{row.error}</span>
                        : <span className="text-green-400">✓ OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={handleUpload}
            disabled={uploading || validCount === 0}
            className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-yellow-400/40 text-gray-900 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</>
            ) : (
              `Upload ${validCount} Athletes`
            )}
          </button>
        </div>
      )}

      {/* Upload result */}
      {result && (
        <div className="flex items-center gap-2 p-4 bg-green-950 border border-green-800 rounded-lg text-green-400">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">
            Successfully added <strong>{result.inserted}</strong> athletes
            {result.season && <> to <strong>{result.season}</strong></>}.
            {result.skipped > 0 && ` (${result.skipped} duplicates skipped)`}
          </span>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 p-4 bg-red-950 border border-red-800 rounded-lg text-red-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm">{uploadError}</span>
        </div>
      )}
    </div>
  )
}
