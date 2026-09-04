export type AudioMetadata = {
  duration: number
  sizeLabel: string
}

const supportedExtensions = new Set(['mp3', 'm4a', 'wav', 'ogg', 'opus', 'webm', 'aac', 'flac'])

export function validateAudioFile(file: File, maximumSize: number, uiLanguage: 'de' | 'en'): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const isAudio = file.type.startsWith('audio/') || (extension !== undefined && supportedExtensions.has(extension))

  if (!isAudio) {
    return uiLanguage === 'de'
      ? 'Bitte wähle eine Audiodatei aus. Unterstützt werden MP3, M4A, WAV, OGG, OPUS und WebM.'
      : 'Please choose an audio file. Supported formats include MP3, M4A, WAV, OGG, OPUS, and WebM.'
  }

  if (file.size === 0) {
    return uiLanguage === 'de'
      ? 'Diese Datei ist leer. Bitte wähle eine Sprachnachricht mit Audioinhalt aus.'
      : 'This file is empty. Please choose a voice note with audio content.'
  }

  if (file.size > maximumSize) {
    return uiLanguage === 'de'
      ? 'Diese Datei ist größer als 200 MB. Kürze sie zuerst und versuche es dann erneut.'
      : 'This file is larger than 200 MB. Trim it first, then try again.'
  }

  return null
}

export function formatDuration(duration: number): string {
  const minutes = Math.floor(duration / 60)
  const seconds = Math.round(duration % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

export async function getAudioMetadata(file: File): Promise<AudioMetadata> {
  const url = URL.createObjectURL(file)
  const audio = document.createElement('audio')
  audio.preload = 'metadata'
  audio.src = url

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      audio.addEventListener('loadedmetadata', () => resolve(audio.duration), { once: true })
      audio.addEventListener('error', () => reject(new Error('Unsupported audio')), { once: true })
    })

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('Missing duration')
    }

    return {
      duration,
      sizeLabel: formatFileSize(file.size),
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

// Web workers do not expose the Web Audio API, so decoding must happen on the
// main thread. The resulting mono 16kHz samples are then transferred to the
// transcription worker.
export async function decodeToMonoSamples(buffer: ArrayBuffer): Promise<Float32Array> {
  const probe = new OfflineAudioContext(1, 1, 16_000)
  const decoded = await probe.decodeAudioData(buffer)
  const targetLength = Math.ceil(decoded.duration * 16_000)
  const renderer = new OfflineAudioContext(1, targetLength, 16_000)
  const source = renderer.createBufferSource()
  source.buffer = decoded
  source.connect(renderer.destination)
  source.start()
  const rendered = await renderer.startRendering()
  return rendered.getChannelData(0)
}
