export type Summary = {
  overview: string
  keyPoints: string[]
  actionItems: string[]
}

function sentencesFrom(transcript: string) {
  return transcript
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 12)
}

export function buildSummary(transcript: string, uiLanguage: 'de' | 'en'): Summary {
  const sentences = sentencesFrom(transcript)
  const actionPattern = /\b(muss|müssen|soll|sollen|werde|werden|nachfassen|senden|schicken|anrufen|termin|aufgabe|todo|need to|needs to|should|will|follow up|send|call|schedule|action|to do)\b/i
  const actionItems = sentences.filter((sentence) => actionPattern.test(sentence)).slice(0, 4)
  const keyPoints = sentences.filter((sentence) => !actionItems.includes(sentence)).slice(0, 4)

  return {
    overview: sentences.length
      ? uiLanguage === 'de'
        ? `${sentences.length} wichtige ${sentences.length === 1 ? 'Aussage' : 'Aussagen'} in dieser Sprachnachricht erkannt.`
        : `${sentences.length} key statement${sentences.length === 1 ? '' : 's'} detected from this voice note.`
      : uiLanguage === 'de'
        ? 'Füge ein Transkript hinzu oder bearbeite es, um eine lokale Zusammenfassung zu erstellen.'
        : 'Add or edit the transcript to generate a local summary.',
    keyPoints: keyPoints.length ? keyPoints : [uiLanguage === 'de' ? 'Noch keine eindeutigen Kernpunkte erkannt.' : 'No distinct key points could be identified yet.'],
    actionItems,
  }
}
