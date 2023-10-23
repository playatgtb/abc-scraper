import { test } from '@playwright/test';
import * as fs from "fs";
import { parse } from "csv-parse/sync";

const DAYS_OFFSET_TO = 3;
const DAYS_OFFSET_FROM = 2;
const NUM_DAYS = DAYS_OFFSET_TO - DAYS_OFFSET_FROM;
const INTERVAL_SECONDS = 15;
const SPACES_24 = '                        ';
const FILTER_TRANSFER_2_SIDED_ONLY = false;
const KEYWORDS = ['bar', 'pool hall', 'poolhall', 'billiards'];

// filtering records
// ABC.ca.gov website
const Urls = {
  STATUS_CHANGES: `https://www.abc.ca.gov/licensing/licensing-reports/status-changes/?RPTTYPE=3&RPTDATE=`
};

const ColumnNames = {
  TRANSFER: 'Transfer-From/To',
  OWNER_AND_ADDRESS: 'Primary Owner and Premises Addr.',
  LICENSE_NUMBER: 'License Number',
};

const getOwnerDBA = (record: any) => record[ColumnNames.OWNER_AND_ADDRESS].split(SPACES_24)[0].trim();

// retrieve daily reports for the past (OFFSET_TO - OFFSET_FROM) days
// generate dates
let DATE = new Date();
DATE.setDate(DATE.getDate() - 2 - DAYS_OFFSET_FROM);
const dates = new Array(NUM_DAYS);
for (let i = 0; i < NUM_DAYS; i++) {
  const date = DATE.toISOString().split('T')[0];
  const d = date.split('-');
  dates[i] = {
    read: `${d[1]}/${d[2]}/${d[0]}`,
    write: date,
  };
  DATE.setDate(DATE.getDate() - 1);
};

const recordsOfInterest = {
  keywordRecords: {},
  transferRecords: {},
}

// process records
const processFile = async(file: string) => {
  // load records from file
  const records = parse(fs.readFileSync(file), {
    columns: true,
    skip_empty_lines: true,
  });

  // filter records
  const filtered = records.filter(record => {
    const ownerDBA = getOwnerDBA(record);
    const hasTransferFromTo = record[ColumnNames.TRANSFER].includes('/');
    const hasOnlyTransferFrom = record[ColumnNames.TRANSFER].trim().length;
    const licenseNumber = record[ColumnNames.LICENSE_NUMBER];
    const hasKeywordMatch = KEYWORDS.find(word => ownerDBA.match(new RegExp(`\\b${word}\\b`, 'i')));
    const hasTransfer = FILTER_TRANSFER_2_SIDED_ONLY ? hasTransferFromTo : hasOnlyTransferFrom;

    if (hasKeywordMatch) {
      recordsOfInterest.keywordRecords[licenseNumber] = record;
    } else {
      recordsOfInterest.transferRecords[licenseNumber] = record;
    }

    // check for transfers and keywords
    // test word boundaries and ignore case
    return hasTransfer// && keywords.find(word => ownerDBA.match(new RegExp(`\\b${word}\\b`, 'i')));
  });
  
  console.log(`original records: ${records.length}`);
  console.log(`filtered records: ${filtered.length}`);

  // process records
  filtered.forEach(record => {
    // show progress
    const ownerDBA = getOwnerDBA(record);
    console.log(ownerDBA, '-----' , record[ColumnNames.TRANSFER]);
  })
}

const downloadReport = async (page: any, URL: string, file: string) => {
  await page.goto(URL);

  // download report
  const button = page.locator('button:has-text("Download Report (CSV)")')
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  await download.saveAs(file);
}

const reports: Array<{date: {read: string, write:string}, downloadPath: string, URL: string}> = [];

for (let i = 0; i < dates.length; i++) {
  const date = dates[i];
  reports[i] = {
    date,
    downloadPath: `./downloads/${date.write}/report-status-changes.csv`,
    URL: Urls.STATUS_CHANGES + date.read,
  }

  // This TEST throws if there is no report data, so we need ot react to it
  test(`load abc status-change page ${date.read}`, async ({ page }) => {
    if (reports.length > 1 && fs.existsSync(reports[i-1].downloadPath)) {
      // write empty csv file
    }
    const report = reports[i];

    console.log(`----- ${i + DAYS_OFFSET_FROM} -> ${DAYS_OFFSET_TO}:  ${report.date.read}  ${report.URL}`);
    if (!fs.existsSync(report.downloadPath)) {
      await downloadReport(page, report.URL, report.downloadPath);
    }
    await processFile(report.downloadPath);

    //get detail pages

    if (i >= dates.length - 1) return;
    await new Promise(resolve => setTimeout(resolve, INTERVAL_SECONDS * 1000));
  });
}
