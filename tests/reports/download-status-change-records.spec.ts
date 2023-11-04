import { test } from '@playwright/test';
import * as fs from "fs";
import { parse } from "csv-parse/sync";

function main() {
  const reports: Array<{date: {read: string, write:string}, downloadPath: string, URL: string}> = [];
  const dates = buildReportDateRange();

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    reports[i] = {
      date,
      downloadPath: `./downloads/${date.write}/report-status-changes.csv`,
      URL: URL_STATUS_CHANGES + date.read,
    }

    test(`load abc status-change page ${date.read}`, async ({ page }) => {
      if (reports.length > 1 && fs.existsSync(reports[i-1].downloadPath)) {
        // write empty csv file
      }
      const report = reports[i];

      console.log(`--- ${i} of ${Config.Report.DAYS_RANGE}`, report);
      if (!fs.existsSync(report.downloadPath)) {
        await downloadReport(page, report.URL, report.downloadPath);
      }
      await processRecords(report.downloadPath);

      if (i >= dates.length - 1) return;
      await new Promise(resolve => setTimeout(resolve, Config.Report.THROTTLE_DELAY_SECONDS * 1000));
    });
  }
}

// ------------------------------

const processRecords = async(file: string) => {
  const records = loadRecords(file);
  let filterCount = 0;
  records.forEach(record => {
    const basicMatch = basicFilterMatch(record);
    if (!basicMatch) return;

    const keywordMatchingEnabled = Config.FILTER_BY_KEYWORDS;
    const keywordMatch =  keywordFilterMatch(record);
    if (keywordMatchingEnabled && !keywordMatch) return;

    filterCount++;

    const ownerDBA = getOwnerDBA(record);
    const licenseType = getLicenseType(record);
    const license = record[Config.Headers.LICENSE_NUMBER];
    const hasTransferToRecord = record[Config.Headers.TRANSFER].includes('/');
    const transferTo = hasTransferToRecord && record[Config.Headers.TRANSFER].split('/')[1].trim();

    const data = {
      ownerDBA,
      license,
      licenseType,
      transferTo,
      fullRecord: record,
    }

    console.log(data);
  });
  console.log({filterCount});
}

// ------------------------------

const getOwnerDBA = (record: any) => record[Config.Headers.OWNER_DBA].split(SPACES_24)[0].trim();
const getLicenseType = (record: any) => record[Config.Headers.LICENSE_TYPE].split('|')[0].trim();

const basicFilterMatch = (record: any) => {
  const isStatusActive = record[Config.Headers.STATUS_CHANGE].includes(' ACTIVE');
  const licenseTypeMatch = Config.ABC_LICENSE_TYPES.includes(getLicenseType(record));
  return isStatusActive && licenseTypeMatch;
}

const keywordFilterMatch = (record: any) => {
  const ownerDBA = getOwnerDBA(record);
  return !!Config.KEYWORDS.find(word => ownerDBA.match(new RegExp(`\\b${word}\\b`, 'i')));
}

const loadRecords = (file: string) => {
  return parse(fs.readFileSync(file), {
    columns: true,
    skip_empty_lines: true,
  });
}

const buildReportDateRange = () => {
  const tempDate = new Date();
  tempDate.setDate(tempDate.getDate() - Math.max(Config.Report.START_DAYS_AGO, 2));
  const dates = new Array(Config.Report.DAYS_RANGE);
  for (let i=0; i < dates.length; i++) {
    const date = tempDate.toISOString().split('T')[0];
    const d = date.split('-');
    dates[i] = {
      read: `${d[1]}/${d[2]}/${d[0]}`,
      write: date,
    };
    tempDate.setDate(tempDate.getDate() - 1);
  };
  return dates;
}

const downloadReport = async (page: any, url: string, file: string) => {
  await page.goto(url);
  const button = page.locator('button:has-text("Download Report (CSV)")')
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  await download.saveAs(file);
}

// ------------------------------

const Config = {
  Report: {
    START_DAYS_AGO: 0,
    DAYS_RANGE: 1,
    THROTTLE_DELAY_SECONDS: 10,
  },
  KEYWORDS: ['bar', 'pool hall', 'poolhall', 'billiards'],
  FILTER_BY_KEYWORDS: true,
  ABC_LICENSE_TYPES: [
    '40', // On-Sale Beer
    '41', // On-Sale Beer & Wine - Eating Place
    '42', // On-Sale Beer & Wine - Public Premises
    '47', // On-Sale General - Eating Place
    '48', // On-Sale General - Public Premises
  ],
  Headers: {
    LICENSE_TYPE: 'Type| Dup',
    STATUS_CHANGE: 'Status Changed From/To',
    TRANSFER: 'Transfer-From/To',
    OWNER_DBA: 'Primary Owner and Premises Addr.',
    LICENSE_NUMBER: 'License Number',
  },
};

// ------------------------------

const URL_STATUS_CHANGES = `https://www.abc.ca.gov/licensing/licensing-reports/status-changes/?RPTTYPE=3&RPTDATE=`;
const SPACES_24 = '                        ';

// ------------------------------

main();

// ------------------------------

/**
 * Resources:
 *  - https://www.abc.ca.gov/licensing/
 *  - https://www.abc.ca.gov/licensing/licensing-reports/
 *  - https://www.abc.ca.gov/licensing/licensing-reports/status-changes/
 *  - https://www.abc.ca.gov/licensing/license-types/
 */
