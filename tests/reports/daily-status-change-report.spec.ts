import { test, expect } from '@playwright/test';
import * as fs from "fs";
import { parse } from "csv-parse/sync";

function main() {
  for (let i = 0; i < Config.DAYS_RANGE; i++) {
    const date = getReportingDate(i);

    test(`Status Change report ${date.read}`, async ({ page }) => {
      handleEmptyReport(i-1);
      const reportConfig = getReportConfig(date);
      console.log(`-- ${i+1} of ${Config.DAYS_RANGE} : ${date.read}`, reportConfig);
      if (!fs.existsSync(reportConfig.saveDir)) {
        await downloadReport(page, reportConfig, i);
        await processRecords(page, reportConfig);
      } else {
        console.log('records already processed');
      }
      console.log('\n');
    });
  }
}

// ------------------------------

const processRecords = async (page: any, reportConfig: ReportConfig) => {
  const rawRecords = loadRecords(reportConfig.downloadPath);
  if (!rawRecords.length) return;

  console.log(`${rawRecords.length} records \n`);

  for (let i=0; i < rawRecords.length; i++) {
    const recordData = getRecordData(rawRecords[i]);
    if (!basicFilterMatch(recordData)) continue;
    await handleKeywordMatchScreenshots(page, recordData, reportConfig);
  };
}

// hasTransferToRecord:
//   NO:
//     - check record ownerDBA for keyword
//     - if match, nav to license page and take screenshot
//   YES:
//     - nav to license page
//     - check page for keyword
//     - if match, take screenshot

const handleKeywordMatchScreenshots = async (page: any, recordData: RecordData, reportConfig: ReportConfig) => {
  let name = '';
  const hasTransfer = hasTransferToRecord(recordData);
  let keywordMatch = businessNameKeywordMatch(recordData.ownerDBA);
  if (hasTransfer || keywordMatch) {
    await navigateToLicensePage(page, recordData, reportConfig);
  }
  if (hasTransfer) {
    name = await page.locator(ELEMENT_LOCATOR_OWNER_NAME).first().textContent();
    keywordMatch = businessNameKeywordMatch(name);
  }
  if (keywordMatch) {
    await screenshot(page, recordData, reportConfig);
    await saveRecordMetadata(page, recordData, reportConfig);
  }
}

const handleEmptyReport = (daysAgo: number) => {
  if (daysAgo < 0) return;
  const date = getReportingDate(daysAgo);
  const reportConfig = getReportConfig(date);
  if (!fs.existsSync(reportConfig.saveDir)) {
    console.log(`creating empty report dir: ${reportConfig.saveDir} \n`);
    fs.mkdirSync(reportConfig.saveDir, { recursive: true });
    fs.writeFileSync(`${reportConfig.saveDir}/empty.csv`, '');
  }
}

// ------------------------------

const getOwnerDBA = (rawRecord: any) => rawRecord[Config.Headers.OWNER_DBA].split(SPACES_24)[0].trim();
const getLicenseType = (rawRecord: any) => rawRecord[Config.Headers.LICENSE_TYPE].split('|')[0].trim();

const basicFilterMatch = (recordData: RecordData) => {
  const record = recordData.rawRecord;
  const isStatusActive = record[Config.Headers.STATUS_CHANGE].split(' ')[1] === 'ACTIVE';
  const licenseTypeMatch = Config.ABC_LICENSE_TYPES.includes(recordData.licenseType);
  return isStatusActive && licenseTypeMatch;
}

const businessNameKeywordMatch = (name: string) => {
  const exclude = !!Config.OMIT_KEYWORDS.find(word => name.match(new RegExp(`\\b${word}\\b`, 'i')));
  const include = !!Config.SEARCH_KEYWORDS.find(word => name.match(new RegExp(`\\b${word}\\b`, 'i')));
  return !exclude && include;
}

const navigateToLicensePage = async (page: any, recordData: RecordData, reportConfig: ReportConfig) => {
  await throttlePageNavigation(page);
  const singleLicense = getSingleLicense(recordData);
  await page.goto(`${reportConfig.singleLicenseUrlBase}${singleLicense}`);
}

const screenshot = async (page: any, recordData: RecordData, reportConfig: ReportConfig) => {
  const hasTransferTo = hasTransferToRecord(recordData);
  const singleLicense = getSingleLicense(recordData);
  const screenshotPath = `${reportConfig.saveDir}-screenshots/${singleLicense}.png`;
  const screenshotLocator = page.locator(ELEMENT_LOCATOR_FOR_SCREENSHOT);
  expect(screenshotLocator).toBeVisible({ timeout: 10000 });
  await page.locator(ELEMENT_LOCATOR_FOR_SCREENSHOT).screenshot({ path: screenshotPath });
  console.log(`screenshot saved (${hasTransferTo?'transferTo':'record'}): ${screenshotPath}`);
  console.log(`   * ${recordData.ownerDBA}`);
}

const saveRecordMetadata = async (page: any, recordData: RecordData, reportConfig: ReportConfig) => {
  const singleLicense = getSingleLicense(recordData);
  const metadataPath = `${reportConfig.saveDir}-screenshots/${singleLicense}.json`;
  const metadata = JSON.stringify(recordData);
  await fs.writeFileSync(metadataPath, metadata);
  console.log(`metadata saved: ${metadataPath}`);
}

const throttlePageNavigation = async (page: any) => {
  await page.waitForTimeout(Config.THROTTLE_DELAY_SECONDS * 1000);
}

const loadRecords = (file: string) => {
  return parse(fs.readFileSync(file), {
    columns: true,
    skip_empty_lines: true,
  });
}

const downloadReport = async (page: any, reportConfig: ReportConfig, daysAgo: number) => {
  if (daysAgo > 0) {
    await throttlePageNavigation(page);
  }
  await page.goto(reportConfig.statusChangesUrl);
  const button = page.locator(ELEMENT_LOCATOR_DOWNLOAD_CSV_BUTTON);
  expect(button).toBeVisible({ timeout: 10000 });

  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  await download.saveAs(`${reportConfig.downloadPath}`);
}

const hasTransferToRecord = (recordData: RecordData) => {
  return !!recordData.transferTo;
}

const getSingleLicense = (recordData: RecordData) => {
  return recordData.transferTo || recordData.license;
}

const getReportingDate = (daysAgo: number, useToday = false): ReportDate => {
  const tempDate = new Date();
  if (!useToday) {
    tempDate.setDate(tempDate.getDate() - Math.max(Config.START_DAYS_AGO, 2) - daysAgo);
  }
  const date = tempDate.toLocaleDateString();
  const _ = date.split('/');
  return {
    read: `${_[0]}/${_[1].padStart(2, '0')}/${_[2].padStart(2, '0')}`,
    write: `${_[2]}-${_[0].padStart(2, '0')}-${_[1].padStart(2, '0')}`,
  };
}

const getRecordData = (record: any): RecordData => {
  const ownerDBA = getOwnerDBA(record);
  const licenseType = getLicenseType(record);
  const license = record[Config.Headers.LICENSE_NUMBER];
  const transfer = record[Config.Headers.TRANSFER].trim();
  console.log(`record: ${license} (${transfer})`);
  const hasTransferToRecord = record[Config.Headers.TRANSFER].includes('/');
  const transferToRecord = hasTransferToRecord && record[Config.Headers.TRANSFER].split('/')[1].trim();
  const transferTo = transferToRecord && transferToRecord.split('-')[1].trim();
  const address = `${record[Config.Headers.ADDRESS_STREET]}, ${record[Config.Headers.ADDRESS_CITY]}`;
  const mapsUrl = `https://maps.google.com?q=${encodeURIComponent(address)}`;
  const licensePageUrl = `${URL_SINGLE_LICENSE_BASE}${transferTo || license}`;

  return {
    ownerDBA,
    license,
    licenseType,
    transfer,
    transferTo,
    rawRecord: record,
    mapsUrl,
    licensePageUrl,
  }
}

const getReportConfig = (date: ReportDate): ReportConfig => {
  const saveDir = `./downloads/${date.write}`;
  return {
    date,
    saveDir,
    downloadPath: `${saveDir}/${REPORT_DOWNLOAD_FILENAME}`,
    statusChangesUrl: `${URL_STATUS_CHANGES_BASE}${date.read}`,
    singleLicenseUrlBase: `${URL_SINGLE_LICENSE_BASE}`
  };
}

// ------------------------------

const Config = {
  START_DAYS_AGO: 0,
  DAYS_RANGE: 7,
  THROTTLE_DELAY_SECONDS: 10,
  SEARCH_KEYWORDS: ['bar', 'pool hall', 'poolhall', 'billiards'],
  OMIT_KEYWORDS: ['restaurant', 'sushi bar', 'bar & grill', 'bar and grill'],
  ABC_LICENSE_TYPES: [
    '40', // On-Sale Beer
    '41', // On-Sale Beer & Wine - Eating Place
    '42', // On-Sale Beer & Wine - Public Premises
    '47', // On-Sale General - Eating Place
    '48', // On-Sale General - Public Premises
  ],
  ZIP_CODES: [],
  Headers: {
    LICENSE_TYPE: 'Type| Dup',
    STATUS_CHANGE: 'Status Changed From/To',
    TRANSFER: 'Transfer-From/To',
    OWNER_DBA: 'Primary Owner and Premises Addr.',
    LICENSE_NUMBER: 'License Number',
    ADDRESS_STREET: 'Prem Street',
    ADDRESS_CITY: 'City',
    ADDRESS_ZIP: 'Zip Code',
    COUNTY_CODE: 'County',
  },
};

// ------------------------------

type ReportConfig = {
  date: {read: string, write:string},
  saveDir: string,
  downloadPath: string,
  statusChangesUrl: string,
  singleLicenseUrlBase: string,
};

type RecordData = {
  ownerDBA: string,
  license: string,
  licenseType: string,
  transfer: string,
  transferTo: string,
  mapsUrl: string,
  licensePageUrl: string,
  rawRecord: any,
}
type ReportDate = {read: string, write: string};

// ------------------------------

const URL_STATUS_CHANGES_BASE = `https://www.abc.ca.gov/licensing/licensing-reports/status-changes/?RPTTYPE=3&RPTDATE=`;
const URL_SINGLE_LICENSE_BASE = `https://www.abc.ca.gov/licensing/license-lookup/single-license/?RPTTYPE=12&LICENSE=`;
const SPACES_24 = '                        ';
const REPORT_DOWNLOAD_FILENAME = 'report-status-changes.csv';
const ELEMENT_LOCATOR_FOR_SCREENSHOT = '#et-boc .et_pb_section_0';
const ELEMENT_LOCATOR_DOWNLOAD_CSV_BUTTON = 'button:has-text("Download Report (CSV)")';
const ELEMENT_LOCATOR_OWNER_NAME = 'dd:near(:text("Primary Owner"))';

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
