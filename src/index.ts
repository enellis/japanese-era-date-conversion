import fs from 'fs-extra';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';

import { eraInfo } from './era-info';
import { gengous } from './gengous';
import { parseNumber } from './numbers';
import { yearMap } from './year-map';

const OUTPUT_DIR = 'output/';

const FILE_HEADER = `// This file was generated using the Japanese Era Date Conversion Tool.
// https://github.com/enellis/japanese-era-date-conversion

type MonthDates = Record<number, Array<number>>;

type EraInfo = {
  reading: string;
  yomi: string;
  start: string;
  end: string;
  years: Record<number, MonthDates>;
};

export const eraInfo: Record<string, EraInfo> = `;

type MonthDates = Record<number, Array<number>>;

type EraInfo = {
  reading: string;
  yomi: string;
  start: string;
  end: string;
  years: Record<number, MonthDates>;
};

(async () => {
  await main();
})();

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }

  const fullData: Record<string, EraInfo> = {};
  for (const gengou of gengous) {
    const eraName = gengou.name;
    fullData[eraName] = await getDataForEra(eraName);
  }

  fs.writeFileSync(
    OUTPUT_DIR + 'era-info.ts',
    FILE_HEADER + JSON.stringify(fullData)
  );
}

async function getDataForEra(era: string): Promise<EraInfo> {
  const newEraInfo: EraInfo = {} as EraInfo;

  const reading = yearMap.get(era)?.reading;
  const yomi = yearMap.get(era)?.yomi;
  if (reading === undefined || yomi === undefined) {
    console.error('Could not find readings for era: ' + era);
    return newEraInfo;
  }

  newEraInfo.reading = reading;
  newEraInfo.yomi = yomi;

  const body = await fs.readFile('sites/' + era + '.html');

  const doc = parse('' + body);

  const eChangeOfEra = doc.querySelector('#改元');
  const eStart =
    eChangeOfEra?.parentNode.nextElementSibling?.querySelector('li');

  const eEnd = eStart?.nextElementSibling;

  const specialEraDates: Record<string, { start: string; end: string }> = {
    大宝: { start: '大宝1年3月21日', end: '大宝4年5月10日' },
    //
    元弘: { start: '元徳3年5月5日', end: '元弘4年1月29日' },
    正慶: { start: '元徳3年8月9日', end: '正慶2年5月22日' },
    建武: { start: '正慶2年5月22日', end: '建武5年8月28日' },
    //
    正保: { start: '寛永21年12月16日', end: '正保5年2月15日' },
    //
    明治: { start: '慶応4年9月8日', end: '明治5年12月2日' },
  };

  const start = specialEraDates[era]?.start || eStart?.text.split('（')[0];
  const end = specialEraDates[era]?.end || eEnd?.text.split('（')[0];

  if (start === undefined) {
    console.error(era + ': Start date not found!');
    return {} as EraInfo;
  }
  if (end === undefined) {
    console.error(era + ': End date not found!');
    return {} as EraInfo;
  }

  newEraInfo.start = start;
  newEraInfo.end = end;

  const erasWithAliasTable = ['延元', '興国', '正平'];
  if (erasWithAliasTable.includes(era)) {
    let eAliasTable =
      doc.querySelector('#西暦などとの対照表')?.parentNode.nextElementSibling;

    if (eAliasTable === undefined) {
      eAliasTable =
        doc.querySelector('#西暦との対照表')?.parentNode.nextElementSibling;
    }

    const eAliasRows = eAliasTable?.querySelectorAll('tr');

    if (eAliasRows === undefined) {
      console.error(era + ': Alias table not found!');
      return {} as EraInfo;
    }

    let currentHeadings: Array<string> = [];
    const yearData: Record<string, MonthDates> = {};

    for (const eRow of eAliasRows) {
      const headings = eRow
        .querySelectorAll('th')
        .map((e) =>
          e.text.replace('元', '1').replace(/(※|¶|年|歳|月|閏|\n)/g, '')
        );

      if (headings.length) {
        currentHeadings = headings;
        continue;
      }

      const years = eRow
        .querySelectorAll('td')
        .map((e) =>
          e.text.replace('元', '1').replace(/(※|¶|年|歳|月|閏|\n)/g, '')
        );

      if (years[0] === '北朝') {
        for (let i = 1; i < currentHeadings.length; i++) {
          const refEra = years[i].slice(0, 2);
          const refYear = parseInt(years[i].slice(2));
          yearData[currentHeadings[i]] = eraInfo[refEra].years[refYear];
        }
      }
    }

    newEraInfo.years = yearData;
    return newEraInfo;
  }

  let eConversionTable =
    doc.querySelector('#西暦との対照表')?.parentNode.nextElementSibling
      ?.nextElementSibling;

  if (era === '明治') {
    eConversionTable = eConversionTable?.nextElementSibling;
  }

  const eRows = eConversionTable?.querySelectorAll('tr');

  if (eRows === undefined) {
    console.error(era + ': Conversion table not found!');
    return {} as EraInfo;
  }

  let currentHeadings: number[] = [];

  const gregorianData: Record<string, MonthDates> = {};
  const julianData: Record<string, MonthDates> = {};

  const years: Record<string, MonthDates> = {};

  for (const eRow of eRows) {
    const headings = eRow.querySelectorAll('th').map((e) => {
      const isLeapMonth = e.text.includes('閏');

      const stripped = e.text
        .split('（')[0]
        .replace(era, '')
        .replace('元', '1')
        .replace(/(※|¶|年|歳|月|閏|\n)/g, '');

      let number = parseNumber(stripped);
      if (number === null) {
        // console.error("Could not parse number in: " + stripped);
        return 0;
      }

      if (isLeapMonth) {
        number = -number;
      }

      return number;
    });

    if (headings.length > 1) {
      currentHeadings = headings;
    }
    if (headings.length) {
      continue;
    }

    const dates = eRow
      .querySelectorAll('td')
      .map((e) => e.text.replace('\n', '').split('–')[0].split('/'));

    const gregorianDates: MonthDates = {};
    const julianDates: MonthDates = {};

    let year = 0;
    let month = 0;
    let day = 0;

    for (let i = 1; i < currentHeadings.length; i++) {
      const date = dates[i];
      if (date.length === 3) {
        year = parseInt(date[0]);
        month = parseInt(date[1]);
        day = parseInt(date[2]);
      } else if (date.length === 2) {
        month = parseInt(date[0]);
        day = parseInt(date[1]);
      } else {
        continue;
      }

      if (
        dates[0][0] === 'グレゴリオ暦' ||
        (era === '明治' && dates[0][0] === '西暦')
      ) {
        gregorianDates[currentHeadings[i]] = [year, month, day];
      } else if (dates[0][0] === 'ユリウス暦') {
        const gregorianConverted = julian2gregorian(
          new Date(year, month - 1, day)
        );

        julianDates[currentHeadings[i]] = [
          gregorianConverted.getFullYear(),
          gregorianConverted.getMonth() + 1,
          gregorianConverted.getDate(),
        ];
      }
    }

    if (Object.keys(gregorianDates).length) {
      gregorianData[currentHeadings[0]] = gregorianDates;
      years[currentHeadings[0]] = gregorianDates;
    } else if (Object.keys(julianDates).length) {
      julianData[currentHeadings[0]] = julianDates;
      years[currentHeadings[0]] = julianDates;
    } else {
      console.error(era + ': No dates found');
    }
  }

  newEraInfo.years = years;

  for (const key in gregorianData) {
    const gregData = JSON.stringify(gregorianData[key]);
    const julData = JSON.stringify(julianData[key]);

    if (julData !== undefined && gregData !== julData) {
      console.error(era + ': Converted dates are not the same!');
      console.log('Gregorian: ' + gregData);
      console.log('Julian:    ' + julData);
    }
  }

  return newEraInfo;
}

function julian2gregorian(dateTime: Date) {
  let year = dateTime.getFullYear();
  if (dateTime.getMonth() < 2) {
    year -= 1;
  }

  const jh = Math.floor(year / 100);
  const a = Math.floor(jh / 4);
  const b = jh % 4;
  const dayDiff = 3 * a + b - 2;

  const millisecondsInADay = 86_400_000;

  return new Date(dateTime.valueOf() + dayDiff * millisecondsInADay);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchGengous() {
  const siteLink = '/wiki/%E5%A4%A7%E5%8C%96';
  const response = await fetch('https://ja.wikipedia.org' + siteLink);
  const body = await response.text();
  const doc = parse(body);

  const gengouTable =
    doc.querySelector('#日本の元号')?.parentNode.parentNode.parentNode;
  const allEras = gengouTable?.querySelectorAll('li > a');

  if (allEras === undefined) {
    console.error('Gengou table not found!');
    return;
  }

  const gengous: Array<Record<string, string>> = [];
  for (const era of allEras) {
    gengous.push({
      name: era.text,
      href: era.getAttribute('href') || siteLink,
    });
  }

  fs.writeFileSync(
    OUTPUT_DIR + 'gengous.ts',
    'export const gengous = ' + JSON.stringify(gengous)
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchSites() {
  for (const gengou of gengous) {
    const eraName = gengou.name;
    console.log('Getting html for era: ' + eraName);

    const response = await fetch('https://ja.wikipedia.org' + gengou.href);
    const body = await response.text();

    const SITES_DIR = OUTPUT_DIR + 'sites/';
    if (!fs.existsSync(SITES_DIR)) {
      fs.mkdirSync(SITES_DIR);
    }

    fs.writeFileSync(SITES_DIR + eraName + '.html', body);

    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
  }
}
