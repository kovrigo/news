// Number words 0-999 in all case forms. Ordinals are not converted (documented limitation).
const WORDS: Record<number, string> = {
  0: 'ноль нуль ноля нуля нолю нулю нолем нулем ноле нуле',
  1: 'один одна одно одни одного одной одному одним одну одном одних одними',
  2: 'два две двух двум двумя',
  3: 'три трех трем тремя',
  4: 'четыре четырех четырем четырьмя',
  5: 'пять пяти пятью',
  6: 'шесть шести шестью',
  7: 'семь семи семью',
  8: 'восемь восьми восемью восьмью',
  9: 'девять девяти девятью',
  10: 'десять десяти десятью',
  11: 'одиннадцать одиннадцати одиннадцатью',
  12: 'двенадцать двенадцати двенадцатью',
  13: 'тринадцать тринадцати тринадцатью',
  14: 'четырнадцать четырнадцати четырнадцатью',
  15: 'пятнадцать пятнадцати пятнадцатью',
  16: 'шестнадцать шестнадцати шестнадцатью',
  17: 'семнадцать семнадцати семнадцатью',
  18: 'восемнадцать восемнадцати восемнадцатью',
  19: 'девятнадцать девятнадцати девятнадцатью',
  20: 'двадцать двадцати двадцатью',
  30: 'тридцать тридцати тридцатью',
  40: 'сорок сорока',
  50: 'пятьдесят пятидесяти пятьюдесятью',
  60: 'шестьдесят шестидесяти шестьюдесятью',
  70: 'семьдесят семидесяти семьюдесятью',
  80: 'восемьдесят восьмидесяти восемьюдесятью',
  90: 'девяносто девяноста',
  100: 'сто ста',
  200: 'двести двухсот двумстам двумястами двухстах',
  300: 'триста трехсот тремстам тремястами трехстах',
  400: 'четыреста четырехсот четыремстам четырьмястами четырехстах',
  500: 'пятьсот пятисот пятистам пятьюстами пятистах',
  600: 'шестьсот шестисот шестистам шестьюстами шестистах',
  700: 'семьсот семисот семистам семьюстами семистах',
  800: 'восемьсот восемисот восемистам восемьюстами восемистах',
  900: 'девятьсот девятисот девятистам девятьюстами девятистах',
};
const VALUE = new Map<string, number>();
for (const [v, forms] of Object.entries(WORDS)) for (const f of forms.split(' ')) VALUE.set(f, Number(v));

const HALF = new Set(['полтора', 'полторы', 'полутора']);
const MULT: Array<[RegExp, number]> = [
  [/^(тыс|тысяч(а|у|и|е|ей|ам|ами|ах|ью)?)$/, 1e3],
  [/^(млн|миллион(а|у|ом|е|ов|ам|ами|ах|ы)?)$/, 1e6],
  [/^(млрд|миллиард(а|у|ом|е|ов|ам|ами|ах|ы)?)$/, 1e9],
];
// A multiplier word alone means one of it ("тысяча человек"); plural and abbreviated forms alone mean nothing.
const ALONE = new Set([
  'тысяча', 'тысячу', 'миллион', 'миллиона', 'миллиону', 'миллионом', 'миллионе',
  'миллиард', 'миллиарда', 'миллиарду', 'миллиардом', 'миллиарде',
]);
// An ordinal after a number word ("двадцать шестом") voids the whole number.
const ORDINAL =
  /^(перв|втор|трет|четверт|пят|шест|седьм|восьм|девят|десят|одиннадцат|двенадцат|тринадцат|четырнадцат|пятнадцат|шестнадцат|семнадцат|восемнадцат|девятнадцат|двадцат|тридцат|сороков|пятидесят|шестидесят|семидесят|восьмидесят|девяност|сот|(дву|трех|четырех|пяти|шести|семи|восьми|девяти)сот)(ый|ой|ий|ая|ую|ое|ого|ому|ым|ом|ые|ых|ыми|ей|ья|ье|ьего|ьему|ьим|ьем|ьи)$/;
const ABBR = new Set(['тыс', 'млн', 'млрд']);

const multOf = (w: string): number => MULT.find(([re]) => re.test(w))?.[1] ?? 0;
const classOf = (v: number): number => (v >= 100 ? 3 : v >= 20 ? 2 : 1);

type Tok = { text: string; digits: boolean; adj: boolean };

const TOKEN =
  /(?<!\d)\d{1,3}(?:[    ]\d{3})+(?!\d)(?:,\d+)?|\d+(?:,\d+)?|\p{L}+/gu;

function lex(text: string): Tok[] {
  const src = text.toLowerCase().replace(/ё/g, 'е');
  const out: Tok[] = [];
  let prevEnd = -1;
  let prev = '';
  for (const m of src.matchAll(TOKEN)) {
    const gap = prevEnd < 0 ? 'x' : src.slice(prevEnd, m.index);
    const adj = prevEnd >= 0 && (/^\s*$/.test(gap) || (ABBR.has(prev) && /^\.\s*$/.test(gap)));
    out.push({ text: m[0], digits: /^\d/.test(m[0]), adj });
    prevEnd = m.index + m[0].length;
    prev = m[0];
  }
  return out;
}

const parseDigits = (s: string): number => Number(s.replace(/[    ]/g, '').replace(',', '.'));

export function extractNumbers(text: string): number[] {
  const t = lex(text);
  // One atom: a group of number tokens plus an optional multiplier. Returns null when t[i] starts none.
  const atom = (i: number): { value: number; mult: number; next: number; ordinal?: boolean } | null => {
    const first = t[i];
    if (!first) return null;
    let g: number;
    let j = i + 1;
    if (first.digits) g = parseDigits(first.text);
    else if (HALF.has(first.text)) g = 1.5;
    else if (VALUE.has(first.text)) {
      g = VALUE.get(first.text)!;
      let last = classOf(g);
      for (let v: number | undefined; j < t.length && t[j]!.adj && (v = VALUE.get(t[j]!.text)) !== undefined && classOf(v) < last; j++) {
        g += v;
        last = classOf(v);
      }
    } else if (ALONE.has(first.text)) return { value: 1, mult: multOf(first.text), next: i + 1 };
    else return null;
    if (!first.digits && j < t.length && t[j]!.adj && ORDINAL.test(t[j]!.text)) return { value: g, mult: 1, next: j + 1, ordinal: true };
    const m = j < t.length && t[j]!.adj ? multOf(t[j]!.text) : 0;
    return m ? { value: g, mult: m, next: j + 1 } : { value: g, mult: 1, next: j };
  };

  const out: number[] = [];
  for (let i = 0; i < t.length; ) {
    const a = atom(i);
    if (!a) {
      i++;
      continue;
    }
    let sum = a.value * a.mult;
    let last = a.mult;
    let voided = a.ordinal === true;
    i = a.next;
    // "два миллиона триста тысяч": keep adding atoms while the multiplier falls.
    while (last > 1 && i < t.length && t[i]!.adj) {
      const b = atom(i);
      if (!b || b.mult >= last) break;
      voided ||= b.ordinal === true;
      sum += b.value * b.mult;
      last = b.mult;
      i = b.next;
    }
    if (!voided) out.push(Math.round(sum * 1e6) / 1e6);
  }
  return out;
}
