import { test } from '@playwright/test';
import * as fs from "fs";
import { parse } from "csv-parse/sync";

/**
 * References
 * https://www.abc.ca.gov/licensing/
 * https://www.abc.ca.gov/licensing/licensing-reports/
 * https://www.abc.ca.gov/licensing/licensing-reports/status-changes/
 * https://www.abc.ca.gov/licensing/license-types/
 */

const SPACES_24 = '                        ';

// Configuration
const Config = {
  DAYS_OFFSET_TO: 3,
  DAYS_OFFSET_FROM: 2,
  NUM_DAYS: 1,
  INTERVAL_SECONDS: 15,
  KEYWORDS: ['bar', 'pool hall', 'poolhall', 'billiards'],
  LICENSE_TYPES: [
    40, // On-Sale Beer
    41, // On-Sale Beer & Wine - Eating Place
    42, // On-Sale Beer & Wine - Public Premises
    47, // On-Sale General - Eating Place
    48, // On-Sale General - Public Premises
  ],
  FILTER_BY_KEYWORDS: true,
}
Config.NUM_DAYS = Config.DAYS_OFFSET_TO - Config.DAYS_OFFSET_FROM;

// daily reports for the past (OFFSET_TO - OFFSET_FROM) days
// NOTE: report by date can only be generated before 2 days ago
const DATE = new Date();
DATE.setDate(DATE.getDate() - 2 - Config.DAYS_OFFSET_FROM);

// filtering records
// ABC.ca.gov website
const Urls = {
  STATUS_CHANGES: `https://www.abc.ca.gov/licensing/licensing-reports/status-changes/?RPTTYPE=3&RPTDATE=`
};

const Headers = {
  LICENSE_TYPE: 'Type| Dup',
  STATUS_CHANGE: 'Status Changed From/To',
  TRANSFER: 'Transfer-From/To',
  OWNER_DBA: 'Primary Owner and Premises Addr.',
  LICENSE_NUMBER: 'License Number',
};

const getOwnerDBA = (record: any) => record[Headers.OWNER_DBA].split(SPACES_24)[0].trim();
const getLicenseType = (record: any) => record[Headers.LICENSE_TYPE].split('|')[0].trim();

// retrieve reports
const dates = new Array(Config.NUM_DAYS);
for (let i = 0; i < Config.NUM_DAYS; i++) {
  const date = DATE.toISOString().split('T')[0];
  const d = date.split('-');
  dates[i] = {
    read: `${d[1]}/${d[2]}/${d[0]}`,
    write: date,
  };
  DATE.setDate(DATE.getDate() - 1);
};

const licenseTypeRecords: Array<any> = [];
const keywordRecords: Array<any> = [];
const transferToRecords: Array<any> = [];
const recordsOfInterest = {
  licenseTypeRecords,
  keywordRecords,
  transferToRecords,
}

// process records
const processFile = async(file: string) => {
  // load records from file
  const records = parse(fs.readFileSync(file), {
    columns: true,
    skip_empty_lines: true,
  });

  // filter
  // * status: ACTIVE - i.e. status changes to active, e.g. "CANCEL ACTIVE"
  // * type:  one of the license types we care about
  const basicFilter = records.filter((record: any) => {
    const isActive = record[Headers.STATUS_CHANGE].includes(' ACTIVE');
    const hasLicenseType = Config.LICENSE_TYPES.includes(getLicenseType(record));
    return isActive && hasLicenseType;
  });

  // analyze records
  // * keywords
  // * transfer-to record
  if (Config.FILTER_BY_KEYWORDS) {
    recordsOfInterest.keywordRecords = basicFilter.map(record => {
      const ownerDBA = getOwnerDBA(record);
      return Config.KEYWORDS.find(word => ownerDBA.match(new RegExp(`\\b${word}\\b`, 'i')));
    });
  }

  console.log(`basic filter records: ${basicFilter.length}`);
  console.log(`keyword filter records: ${recordsOfInterest.keywordRecords.length}`);

  // process
  recordsOfInterest.keywordRecords.forEach(record => {
    const ownerDBA = getOwnerDBA(record);
    const licenseType = getLicenseType(record);
    const licenseNumber = record[Headers.LICENSE_NUMBER];
    const transfer = record[Headers.TRANSFER];
    //const hasTransferToRecord = record[Headers.TRANSFER].includes('/');
    console.log(
`------------------------------
owner: ${ownerDBA}
type: ${licenseType}
transfer: ${transfer}
license: ${licenseNumber}`
    );
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

    console.log(`----- ${i + Config.DAYS_OFFSET_FROM} -> ${Config.DAYS_OFFSET_TO}:  ${report.date.read}  ${report.URL}`);
    if (!fs.existsSync(report.downloadPath)) {
      await downloadReport(page, report.URL, report.downloadPath);
    }
    await processFile(report.downloadPath);

    //get detail pages

    if (i >= dates.length - 1) return;
    await new Promise(resolve => setTimeout(resolve, Config.INTERVAL_SECONDS * 1000));
  });
}
