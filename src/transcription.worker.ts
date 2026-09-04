import { env, pipeline } from '@huggingface/transformers'

type TranscriptionRequest = {
  type: 'transcribe'
  samples: Float32Array
  language: string
  uiLanguage: 'de' | 'en'
}

type TranscriptionResult = { text?: unknown }

env.allowLocalModels = false

function postProgress(message: string) {
  postMessage({ type: 'progress', message })
}

self.onmessage = async (event: MessageEvent<TranscriptionRequest>) => {
  try {
    const german = event.data.uiLanguage === 'de'
    postProgress(german ? 'Das lokale Whisper-Modell wird heruntergeladen (nur bei der ersten Nutzung) ...' : 'Downloading the on-device Whisper model (first use only)...')
    const samples = event.data.samples
    const transcriber = await pipeline('automatic-speech-recognition', 'onnx-community/whisper-base', {
      dtype: {
        encoder_model: 'fp32',
        decoder_model_merged: 'q4',
      },
      progress_callback: () => postProgress(german ? 'Das lokale Whisper-Modell wird geladen ...' : 'Loading the on-device Whisper model...'),
    })

    postProgress(german ? 'Transkription läuft lokal in deinem Browser ...' : 'Transcribing locally in your browser...')
    const result = await transcriber(samples, {
      language: event.data.language === 'auto' ? undefined : event.data.language,
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    }) as TranscriptionResult
    const transcript = typeof result.text === 'string' ? result.text : ''

    if (!transcript) {
      throw new Error(german ? 'Das Transkriptionsmodell hat für dieses Audio keinen Text zurückgegeben.' : 'The transcription model did not return text for this audio.')
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
