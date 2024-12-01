import { eraInfo } from './era-info.js';
import { DateArray } from './index.js';
import { parseNumber } from './numbers.js';

function isEraName(text: string): boolean {
  return text in eraInfo;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isGregorianYear(era: string, year: number): boolean {
  return false;
}

function toGregorianDate(
  era: string,
  year: number,
  month: number,
  day: number
): Date {
  const dateArray = eraInfo[era].years[year][month];

  const date = new Date(dateArray[0], dateArray[1] - 1, dateArray[2] + day - 1);

  return date;
}

type ParsedEraDate = {
  era: string;
  year: number;
  month?: number;
  day?: number;

  matchLength: number;
};

function parseEraDate(text: string): ParsedEraDate | undefined {
  const numerals = '0-9０-９〇一二三四五六七八九十百';

  // This is a bit complicated because for a numeric year we don't require the
  // 年 but for 元年 we do. i.e. '令和2' is valid but '令和元' is not.
  const yearRegex = String.raw`(?:([${numerals}]+\s*(?:年|歳)?)|(元\s*(?:年|歳)))`;
  const monthRegex = String.raw`\s*(閏?\s*[${numerals}]+)\s*月`;
  const dayRegex = String.raw`\s*([${numerals}]+)\s*日`;

  const fullRegex = new RegExp(
    `${yearRegex}(?:${monthRegex}(?:${dayRegex})?)?`,
    'g'
  );
  const matches = fullRegex.exec(text);

  let matchLength = fullRegex.lastIndex;

  if (!matches || matches.index === 0) {
    return undefined;
  }

  // Look for an era
  const era = text.substring(0, matches.index).trim();
  if (!isEraName(era)) {
    return undefined;
  }

  // Parse year
  let year: number | null = null;
  if (typeof matches[1] !== 'undefined') {
    year = parseNumber(matches[1].replace(/(年|歳)/g, '').trim());
    if (typeof year === 'number') {
      if (year < 1) {
        year = null;
      } else if (!isGregorianYear(era, year) && !(year in eraInfo[era].years)) {
        year = null;
      }
    }
  } else if (typeof matches[2] !== 'undefined') {
    year = 0;
  }

  if (year === null) {
    return undefined;
  }

  // Parse month
  let month: number | null | undefined = null;
  if (typeof matches[3] !== 'undefined') {
    const isLeapMonth = matches[3].includes('閏');
    month = parseNumber(matches[3].replace('閏', '').trim());
    if (typeof month === 'number') {
      if (isLeapMonth) {
        month = -month;
      }

      if (isGregorianYear(era, year)) {
        if (month < 1 || month > 12) {
          month = null;
        }
      } else if (!(month in eraInfo[era].years[Math.max(year, 1)])) {
        month = null;
      }
    }
  }

  if (month === null) {
    if (year === 0) {
      matchLength = matches.index + matches[2].length;
    } else {
      matchLength = matches.index + matches[1].length;
    }
    month = undefined;
  }

  // Parse day
  let day: number | null | undefined = null;
  if (typeof matches[4] !== 'undefined') {
    day = parseNumber(matches[4]);
    if (typeof day === 'number' && day < 1) {
      day = null;
    }
  }

  if (!month || !day) {
    day = undefined;
  }

  return { era, year, month, day, matchLength };
}

export function eraDateStringToGregorianDateArray(
  eraDate: string
): DateArray | undefined {
  const parsed = parseEraDate(eraDate);

  if (!parsed || !parsed.month || !parsed.day) {
    return undefined;
  }

  const gregorian = toGregorianDate(
    parsed.era,
    Math.max(parsed.year, 1),
    parsed.month,
    parsed.day
  );

  return [
    gregorian.getFullYear(),
    gregorian.getMonth() + 1,
    gregorian.getDate(),
  ];
}
