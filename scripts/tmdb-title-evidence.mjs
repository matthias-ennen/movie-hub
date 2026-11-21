import { normalizeWaipuText } from './waipu-program-classifier.mjs'

// Exact comparisons must preserve non-Latin letters; the legacy Latin
// normalizer remains appropriate for German/English titles. Never let a
// mixed-script title turn into an exact Latin alias by deleting other letters.
export function hasNonLatinLetters(value) {
  return [...String(value || '').normalize('NFKD')]
    .some(character => /\p{L}/u.test(character) && !/\p{Script=Latin}/u.test(character))
}

export function exactTitleKey(value) {
  if (!hasNonLatinLetters(value)) return normalizeWaipuText(value)
  return String(value || '').normalize('NFKC').toLocaleLowerCase('de')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ').trim()
}
