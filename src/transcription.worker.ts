import { env, pipeline } from '@huggingface/transformers'

type TranscriptionRequest = {
  type: 'transcribe'
  samples: Float32Array
  language: string
  uiLanguage: 'de' | 'en'
  translateTo: 'none' | 'en' | 'de'
}

type TranscriptionResult = { text?: unknown }
type TranslationResult = { translation_text?: unknown }

const NLLB_CODES: Record<string, string> = {
  en: 'eng_Latn',
  de: 'deu_Latn',
  fr: 'fra_Latn',
  es: 'spa_Latn',
  it: 'ita_Latn',
  ru: 'rus_Cyrl',
  pl: 'pol_Latn',
  cs: 'ces_Latn',
  uk: 'ukr_Cyrl',
}

type ProgressEvent = {
  status?: string
  file?: string
  loaded?: number
  total?: number
  progress?: number
}

function formatMb(bytes: number) {
  return (bytes / (1024 * 1024)).toFixed(0)
}

function makeDownloadProgressHandler(german: boolean, modelLabel: string) {
  const seen = new Set<string>()
  return (event: ProgressEvent) => {
    if (event.status === 'initiate' && event.file) {
      seen.add(event.file)
    }
    if (event.status === 'progress' && typeof event.loaded === 'number' && typeof event.total === 'number' && event.total > 0) {
      const loadedMb = formatMb(event.loaded)
      const totalMb = formatMb(event.total)
      const percent = Math.round((event.loaded / event.total) * 100)
      postProgress(
        german
          ? `${modelLabel} wird heruntergeladen: ${loadedMb} MB / ${totalMb} MB (${percent} %). Tipp: Nutze WLAN, das kann mehrere hundert MB sein.`
          : `Downloading ${modelLabel}: ${loadedMb} MB / ${totalMb} MB (${percent}%). Tip: use Wi-Fi, this can be several hundred MB.`,
      )
      return
    }
    if (event.status === 'ready' || event.status === 'done') {
      postProgress(german ? `${modelLabel} wird geladen ...` : `Loading ${modelLabel}...`)
    }
  }
}

env.allowLocalModels = false

function postProgress(message: string) {
  postMessage({ type: 'progress', message })
}

self.onmessage = async (event: MessageEvent<TranscriptionRequest>) => {
  try {
    const german = event.data.uiLanguage === 'de'
    const { samples, language, translateTo } = event.data
    postProgress(
      german
        ? 'Das lokale Whisper-Modell wird vorbereitet (ca. 150–300 MB, nur bei der ersten Nutzung). Bitte möglichst WLAN nutzen ...'
        : 'Preparing the on-device Whisper model (approx. 150–300 MB, first use only). Please use Wi-Fi if possible ...',
    )
    const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4',
      },
      progress_callback: makeDownloadProgressHandler(german, german ? 'Whisper-Modell' : 'Whisper model'),
    })

    // English targets can use Whisper's built-in translate task directly.
    // Any other target language needs transcription first, then a separate translation pass.
    const useWhisperTranslate = translateTo === 'en'

    postProgress(german ? 'Transkription läuft lokal in deinem Browser ...' : 'Transcribing locally in your browser...')
    const result = await transcriber(samples, {
      language: language === 'auto' ? undefined : language,
      task: useWhisperTranslate ? 'translate' : 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    }) as TranscriptionResult
    let transcript = typeof result.text === 'string' ? result.text : ''

    if (!transcript) {
      throw new Error(german ? 'Das Transkriptionsmodell hat für dieses Audio keinen Text zurückgegeben.' : 'The transcription model did not return text for this audio.')
    }

    if (translateTo === 'de' && language !== 'de') {
      postProgress(
        german
          ? 'Das lokale Übersetzungsmodell wird vorbereitet (ca. 600–900 MB, nur bei der ersten Nutzung). Bitte möglichst WLAN nutzen ...'
          : 'Preparing the on-device translation model (approx. 600–900 MB, first use only). Please use Wi-Fi if possible ...',
      )
      const translator = await pipeline('translation', 'Xenova/nllb-200-distilled-600M', {
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q8' },
        progress_callback: makeDownloadProgressHandler(german, german ? 'Übersetzungsmodell' : 'translation model'),
      })
      const sourceCode = NLLB_CODES[language] ?? 'eng_Latn'
      postProgress(german ? 'Übersetzung ins Deutsche läuft ...' : 'Translating to German...')
      const translation = await translator(transcript, {
        src_lang: sourceCode,
        tgt_lang: 'deu_Latn',
      }) as TranslationResult | TranslationResult[]
      const translated = Array.isArray(translation) ? translation[0]?.translation_text : translation.translation_text
      if (typeof translated === 'string' && translated.trim()) transcript = translated
    }

    postMessage({ type: 'complete', transcript })
  } catch (reason) {
    const german = event.data.uiLanguage === 'de'
    const message = reason instanceof Error ? reason.message : german ? 'Die Transkription ist unerwartet fehlgeschlagen.' : 'Transcription failed unexpectedly.'
    postMessage({
      type: 'error',
      message: german ? `Diese Datei konnte nicht lokal transkribiert werden: ${message}` : `Could not transcribe this file locally: ${message}`,
    })
  }
}
