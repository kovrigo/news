export function normalize(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .trim();
}

export function tokens(text: string): string[] {
  const n = normalize(text);
  return n === '' ? [] : n.split(' ');
}
