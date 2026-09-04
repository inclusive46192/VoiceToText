import { useEffect, useRef, useState } from 'react'
import './App.css'
import { formatDuration, getAudioMetadata, validateAudioFile, type AudioMetadata } from './audio'
import { buildSummary, type Summary } from './summary'
import { clearSavedSession, loadSavedSession, saveSession } from './storage'

type UiLanguage = 'de' | 'en'
type ProcessingStage = 'empty' | 'ready' | 'loading-model' | 'transcribing' | 'complete' | 'error'
type TranscriptionWorkerMessage =
  | { type: 'progress'; message: string }
  | { type: 'complete'; transcript: string }
  | { type: 'error'; message: string }

const MAX_FILE_SIZE = 200 * 1024 * 1024
const initialUiLanguage: UiLanguage = localStorage.getItem('voice-to-text-ui-language') === 'en' ? 'en' : 'de'

const copy = {
  de: {
    privacy: 'Privat von Anfang an',
    titleBefore: 'Sprachnachrichten werden zu',
    titleEmphasis: 'klaren Gedanken.',
    hero: 'Audio direkt im Browser transkribieren und anschließend eine prägnante, bearbeitbare Zusammenfassung prüfen. Nichts wird auf einen Server hochgeladen.',
    workspace: 'Arbeitsbereich für Audiotranskription',
    drop: 'Sprachnachricht hier ablegen',
    choose: 'Audiodatei auswählen',
    or: 'oder eine Datei von deinem Gerät auswählen',
    formats: 'MP3, M4A, WAV, OGG, OPUS, WebM · bis zu 200 MB',
    replace: 'Ersetzen',
    reading: 'Audio wird gelesen ...',
    audioFallback: 'Dein Browser unterstützt die Audiowiedergabe nicht.',
    transcriptionLanguage: 'Sprache der Transkription',
    detect: 'Automatisch erkennen',
    english: 'Englisch',
    german: 'Deutsch',
    french: 'Französisch',
    spanish: 'Spanisch',
    italian: 'Italienisch',
    modelNote: 'Die erste Nutzung lädt ein Modell und kann etwas dauern.',
    transcribe: 'Audio transkribieren',
    working: 'Wird verarbeitet ...',
    transcript: 'Transkript',
    review: 'Prüfen und überarbeiten',
    copy: 'Alles kopieren',
    copied: 'Kopiert',
    download: 'Herunterladen',
    clear: 'Löschen',
    editableTranscript: 'Bearbeitbares Transkript',
    summary: 'Lokale Zusammenfassung',
    keyPoints: 'Kernpunkte',
    actionItems: 'Aufgaben',
    noActions: 'Keine konkreten Aufgaben erkannt.',
    footerPrivacy: 'Audio bleibt auf deinem Gerät.',
    footerPurpose: 'Für private Sprachnachrichten und Interviewaufnahmen.',
    initial: 'Wähle eine Audiodatei aus, um zu beginnen.',
    restored: 'Dein letztes Transkript wurde aus diesem Browser wiederhergestellt.',
    ready: 'Das Audio ist bereit. Die Transkription erfolgt vollständig in deinem Browser.',
    preparing: 'Audio wird vorbereitet und das lokale Transkriptionsmodell geladen ...',
    complete: 'Transkription abgeschlossen. Deine Ergebnisse bleiben in diesem Browser.',
    unreadable: 'Diese Audiodatei konnte von deinem Browser nicht gelesen werden. Versuche WAV, MP3, M4A, OGG oder OPUS.',
    downloadName: 'sprachnachricht-transkript.txt',
    copiedContent: 'Transkript\n\n{transcript}\n\nZusammenfassung\n\n{overview}\n\nKernpunkte\n{points}\n\nAufgaben\n{actions}',
  },
  en: {
    privacy: 'Private by default',
    titleBefore: 'Turn voice notes into',
    titleEmphasis: 'clear thinking.',
    hero: 'Transcribe audio locally in your browser, then review a concise, editable summary. Nothing is uploaded to a server.',
    workspace: 'Audio transcription workspace',
    drop: 'Drop your voice note here',
    choose: 'Choose audio file',
    or: 'or choose a file from your device',
    formats: 'MP3, M4A, WAV, OGG, OPUS, WebM · up to 200 MB',
    replace: 'Replace',
    reading: 'Reading audio...',
    audioFallback: 'Your browser does not support audio playback.',
    transcriptionLanguage: 'Transcription language',
    detect: 'Detect automatically',
    english: 'English',
    german: 'German',
    french: 'French',
    spanish: 'Spanish',
    italian: 'Italian',
    modelNote: 'First use downloads a model and may take a moment.',
    transcribe: 'Transcribe audio',
    working: 'Working...',
    transcript: 'Transcript',
    review: 'Review and refine',
    copy: 'Copy all',
    copied: 'Copied',
    download: 'Download',
    clear: 'Clear',
    editableTranscript: 'Editable transcript',
    summary: 'Local summary',
    keyPoints: 'Key points',
    actionItems: 'Action items',
    noActions: 'No explicit actions identified.',
    footerPrivacy: 'Audio stays on your device.',
    footerPurpose: 'Built for private voice notes and interview recordings.',
    initial: 'Choose an audio file to begin.',
    restored: 'Your last transcript was restored from this browser.',
    ready: 'Audio is ready. Transcription runs entirely in your browser.',
    preparing: 'Preparing your audio and loading the on-device transcription model...',
    complete: 'Transcription complete. Your results stay in this browser.',
    unreadable: 'This audio file could not be read by your browser. Try WAV, MP3, M4A, OGG, or OPUS.',
    downloadName: 'voice-note-transcript.txt',
    copiedContent: 'Transcript\n\n{transcript}\n\nSummary\n\n{overview}\n\nKey points\n{points}\n\nAction items\n{actions}',
  },
} as const

function downloadText(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function App() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(initialUiLanguage)
  const [file, setFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [stage, setStage] = useState<ProcessingStage>('empty')
  const [statusMessage, setStatusMessage] = useState<string>(copy.de.initial)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [language, setLanguage] = useState('auto')
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const t = copy[uiLanguage]

  useEffect(() => {
    const restore = async () => {
      const saved = await loadSavedSession()
      if (saved) {
        setTranscript(saved.transcript)
        setSummary(buildSummary(saved.transcript, initialUiLanguage))
        setLanguage(saved.language)
        setStage('complete')
        setStatusMessage(copy[initialUiLanguage].restored)
      }
    }
    void restore()
    return () => workerRef.current?.terminate()
  }, [])

  const changeUiLanguage = (nextLanguage: UiLanguage) => {
    setUiLanguage(nextLanguage)
    localStorage.setItem('voice-to-text-ui-language', nextLanguage)
    document.documentElement.lang = nextLanguage
    if (transcript) setSummary(buildSummary(transcript, nextLanguage))
  }

  useEffect(() => {
    if (!audioUrl) return
    return () => URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  useEffect(() => {
    if (stage === 'complete' && transcript) void saveSession({ transcript, language })
  }, [language, stage, transcript])

  const chooseFile = async (selectedFile: File | undefined) => {
    if (!selectedFile) return
    const validationError = validateAudioFile(selectedFile, MAX_FILE_SIZE, uiLanguage)
    if (validationError) {
      setError(validationError)
      setStage('error')
      return
    }
    try {
      const nextMetadata = await getAudioMetadata(selectedFile)
      setFile(selectedFile)
      setMetadata(nextMetadata)
      setAudioUrl(URL.createObjectURL(selectedFile))
      setError(null)
      setTranscript('')
      setSummary(null)
      setStage('ready')
      setStatusMessage(t.ready)
    } catch {
      setError(t.unreadable)
      setStage('error')
    }
  }

  const transcribe = async () => {
    if (!file) return
    setError(null)
    setStage('loading-model')
    setStatusMessage(t.preparing)
    const worker = new Worker(new URL('./transcription.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current?.terminate()
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<TranscriptionWorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') {
        setStatusMessage(message.message)
        if (message.message === (uiLanguage === 'de' ? 'Transkription läuft lokal in deinem Browser ...' : 'Transcribing locally in your browser...')) setStage('transcribing')
        return
      }
      if (message.type === 'complete') {
        const nextTranscript = message.transcript.trim()
        setTranscript(nextTranscript)
        setSummary(buildSummary(nextTranscript, uiLanguage))
        setStage('complete')
        setStatusMessage(t.complete)
        worker.terminate()
        return
      }
      setError(message.message)
      setStage('error')
      worker.terminate()
    }
    const buffer = await file.arrayBuffer()
    worker.postMessage({ type: 'transcribe', audio: buffer, language, uiLanguage }, [buffer])
  }

  const reset = async () => {
    workerRef.current?.terminate()
    setFile(null); setMetadata(null); setAudioUrl(null); setTranscript(''); setSummary(null); setError(null)
    setStage('empty'); setStatusMessage(t.initial)
    await clearSavedSession()
  }

  const copyResults = async () => {
    const content = t.copiedContent
      .replace('{transcript}', transcript)
      .replace('{overview}', summary?.overview ?? '')
      .replace('{points}', summary?.keyPoints.map((point) => `- ${point}`).join('\n') ?? '')
      .replace('{actions}', summary?.actionItems.map((item) => `- ${item}`).join('\n') ?? '')
    await navigator.clipboard.writeText(content)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const isWorking = stage === 'loading-model' || stage === 'transcribing'
  const canTranscribe = stage === 'ready' && file !== null

  return <main className="app-shell">
    <header className="hero">
      <div className="topline">
        <div className="eyebrow"><span className="privacy-dot" /> {t.privacy}</div>
        <button className="language-toggle" type="button" onClick={() => changeUiLanguage(uiLanguage === 'de' ? 'en' : 'de')}>
          {uiLanguage === 'de' ? 'English' : 'Deutsch'}
        </button>
      </div>
      <h1>{t.titleBefore} <em>{t.titleEmphasis}</em></h1>
      <p className="hero-copy">{t.hero}</p>
    </header>
    <section className="workspace" aria-label={t.workspace}>
      <div className={`drop-zone ${file ? 'has-file' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void chooseFile(event.dataTransfer.files.item(0) ?? undefined) }}>
        <input ref={fileInputRef} className="visually-hidden" type="file" accept="audio/*,.opus,.ogg,.m4a,.mp3,.wav,.webm" onChange={(event) => void chooseFile(event.target.files?.item(0) ?? undefined)} />
        {file ? <div className="file-ready"><div className="audio-mark" aria-hidden="true">♪</div><div><strong>{file.name}</strong><span>{metadata ? `${formatDuration(metadata.duration)} · ${metadata.sizeLabel}` : t.reading}</span></div><button className="text-button" type="button" onClick={() => fileInputRef.current?.click()}>{t.replace}</button></div>
          : <><div className="upload-icon" aria-hidden="true">↑</div><h2>{t.drop}</h2><p>{t.or}</p><button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>{t.choose}</button><small>{t.formats}</small></>}
      </div>
      {audioUrl && <audio className="audio-player" controls src={audioUrl}>{t.audioFallback}</audio>}
      <div className="controls">
        <label>{t.transcriptionLanguage}<select value={language} onChange={(event) => setLanguage(event.target.value)} disabled={isWorking}><option value="auto">{t.detect}</option><option value="en">{t.english}</option><option value="de">{t.german}</option><option value="fr">{t.french}</option><option value="es">{t.spanish}</option><option value="it">{t.italian}</option></select></label>
        <div className="model-note"><strong>Browser Whisper</strong><span>{t.modelNote}</span></div>
        <button className="primary-button" type="button" disabled={!canTranscribe} onClick={() => void transcribe()}>{isWorking ? t.working : t.transcribe}</button>
      </div>
      {(stage !== 'empty' || error) && <div className={`status ${stage === 'error' ? 'status-error' : ''}`} role="status"><span className={isWorking ? 'spinner' : 'status-indicator'} />{error ?? statusMessage}</div>}
    </section>
    {stage === 'complete' && <section className="results" aria-label={t.transcript}>
      <div className="result-heading"><div><span className="section-label">{t.transcript}</span><h2>{t.review}</h2></div><div className="result-actions"><button className="text-button" type="button" onClick={() => void copyResults()}>{copied ? t.copied : t.copy}</button><button className="text-button" type="button" onClick={() => downloadText(t.downloadName, transcript)}>{t.download}</button><button className="text-button danger" type="button" onClick={() => void reset()}>{t.clear}</button></div></div>
      <textarea value={transcript} onChange={(event) => { setTranscript(event.target.value); setSummary(buildSummary(event.target.value, uiLanguage)) }} aria-label={t.editableTranscript} />
      <div className="summary-card"><span className="section-label">{t.summary}</span><h2>{summary?.overview}</h2><div className="summary-grid"><div><h3>{t.keyPoints}</h3><ul>{summary?.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul></div><div><h3>{t.actionItems}</h3>{summary?.actionItems.length ? <ul>{summary.actionItems.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="muted">{t.noActions}</p>}</div></div></div>
    </section>}
    <footer><span>{t.footerPrivacy}</span><span>{t.footerPurpose}</span></footer>
  </main>
}

export default App
