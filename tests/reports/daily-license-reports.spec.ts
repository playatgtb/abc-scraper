import { test, expect } from '@playwright/test';
import * as fs from "fs";
import { parse } from "csv-parse/sync";

function main() {
  Config.DAYS_RANGE = Number(process.env.ABC_CONFIG_DAYS || Config.DAYS_RANGE);
  const ABC_IGNORE_ZIP_CODES = process.env.ABC_IGNORE_ZIP_CODES;
  Config.IGNORE_ZIP_CODES = ABC_IGNORE_ZIP_CODES ?  ABC_IGNORE_ZIP_CODES === 'true' : Config.IGNORE_ZIP_CODES;

  for (let i = 0; i < Config.DAYS_RANGE; i++) {
    const date = getReportingDate(i);
    test(`Status Change report ${date.read}`, async ({ page }) => {
      handleEmptyReport(i-1);
      const reportConfig = getReportConfig(date);
      console.log(`-- ${i+1} of ${Config.DAYS_RANGE} : ${date.read}`, {
        date: reportConfig.date,
        saveDir: reportConfig.saveDir,
      });
      if (!fs.existsSync(reportConfig.saveDir)) {
        const reportTypes = reportConfig.reportTypes;
        for (let j = 0; j < reportTypes.length; j++) {
          const reportType = reportTypes[j];
          await downloadReport(page, reportConfig, reportType, i);
          await processRecords(page, reportConfig, reportType);
        }
      } else {
        console.log('records already processed');
      }
      console.log('\n');
    });
  }
}

// ------------------------------

const processRecords = async (page: any, reportConfig: ReportConfig, reportType: ReportType) => {
  const rawRecords = loadRecords(reportType.downloadPath);
  if (!rawRecords.length) return;

  console.log(`-- Report Type `, {
    id: reportType.id,
    name: reportType.name,
    downloadPath: reportType.downloadPath,
    records: rawRecords.length,
  });

  const licenses = {};
  for (let i=0; i < rawRecords.length; i++) {
    const recordData = getRecordData(rawRecords[i], reportType);

    if (!basicFilterMatch(recordData, reportType) || licenses[recordData.license]) continue;
    if (!zipCodeMatch(recordData)) continue;

    licenses[recordData.license] = recordData;
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

const basicFilterMatch = (recordData: RecordData, reportType: ReportType) => {
  const record = recordData.rawRecord;

  const isStatusActive = reportType.id === 3
    ? record[Config.Headers.STATUS_CHANGE].split(' ')[1] === 'ACTIVE'
    : record[Config.Headers.STATUS] === 'Active';

  const licenseTypeMatch = Config.IGNORE_LICENSE_TYPES
    || Config.ABC_LICENSE_TYPES.includes(recordData.licenseType);
  return isStatusActive && licenseTypeMatch;
}

const zipCodeMatch = (recordData: RecordData) => {
  const zipCode = recordData.rawRecord[Config.Headers.ADDRESS_ZIP];
  const zipCodeNumber = Number(zipCode);
  const zipCodeMatch = ZipCodes.find(zipCode => zipCodeNumber >= zipCode.from && zipCodeNumber <= zipCode.to);
  return Config.IGNORE_ZIP_CODES || !!zipCodeMatch;
}

const businessNameKeywordMatch = (name: string) => {
  const excludeTerms = !!Config.OMIT_KEYWORDS.find(word => name.match(new RegExp(`\\b${word}\\b`, 'i')));
  const includeTerms = !!Config.INCLUDE_KEYWORDS.find(word => name.match(new RegExp(`\\b${word}\\b`, 'i')));
  return !excludeTerms && (Config.IGNORE_INCLUDE_KEYWORDS || includeTerms);
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

const downloadReport = async (page: any, reportConfig: ReportConfig, reportType: ReportType, daysAgo: number) => {
  if (daysAgo > 0) {
    await throttlePageNavigation(page);
  }
  await page.goto(reportType.url);
  const button = page.locator(ELEMENT_LOCATOR_DOWNLOAD_CSV_BUTTON);
  expect(button).toBeVisible({ timeout: 10000 });

  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  await download.saveAs(`${reportType.downloadPath}`);
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
    tempDate.setDate(tempDate.getDate() - Math.max(Config.START_DAYS_AGO, 3) - daysAgo);
  }
  const date = tempDate.toLocaleDateString();
  const _ = date.split('/');
  return {
    read: `${_[0]}/${_[1].padStart(2, '0')}/${_[2].padStart(2, '0')}`,
    write: `${_[2]}-${_[0].padStart(2, '0')}-${_[1].padStart(2, '0')}`,
  };
}

const getRecordData = (record: any, reportType: ReportType): RecordData => {
  const ownerDBA = getOwnerDBA(record);
  const licenseType = getLicenseType(record);
  const license = record[Config.Headers.LICENSE_NUMBER];

  // transfer for reportType 3 only (status changes)
  let transferInfo: any = {};
  if (reportType.id === 3) {
    const transfer = record[Config.Headers.TRANSFER].trim();
    const hasTransferToRecord = record[Config.Headers.TRANSFER].includes('/');
    const transferToRecord = hasTransferToRecord && record[Config.Headers.TRANSFER].split('/')[1].trim();
    const transferTo = transferToRecord && transferToRecord.split('-')[1].trim();
    transferInfo = {
      transfer,
      transferTo,
    }
  }
  const address = `${record[Config.Headers.ADDRESS_STREET]}, ${record[Config.Headers.ADDRESS_CITY]}`;
  const mapsUrl = `https://maps.google.com?q=${encodeURIComponent(address)}`;
  const licensePageUrl = `${URL_SINGLE_LICENSE}${transferInfo.transferTo || license}`;

  return {
    ownerDBA,
    license,
    licenseType,
    ...transferInfo,
    rawRecord: record,
    mapsUrl,
    licensePageUrl,
  }
}

const getReportConfig = (date: ReportDate): ReportConfig => {
  const saveDir = `./downloads/${date.write}`;
  const reportTypes = [
    {
      id: 1,
      name: 'ISSUED_LICENSES',
      url: `${URL_REPORTS_ISSUED_LICENSES}${date.read}`,
      downloadPath: `${saveDir}/${REPORT1_DOWNLOAD_FILENAME}`,
    },
    {
      id: 2,
      name: 'NEW_APPLICATIONS',
      url: `${URL_REPORTS_NEW_APPLICATIONS}${date.read}`,
      downloadPath: `${saveDir}/${REPORT2_DOWNLOAD_FILENAME}`,
    },
    {
      id: 3,
      name: 'STATUS_CHANGES',
      url: `${URL_REPORTS_STATUS_CHANGES}${date.read}`,
      downloadPath: `${saveDir}/${REPORT3_DOWNLOAD_FILENAME}`,
    }
  ].filter(reportType => Config.includeReportTypes[reportType.name]);
  return {
    date,
    saveDir,
    downloadPath: `${saveDir}/${REPORT3_DOWNLOAD_FILENAME}`,
    issuedLicensesUrl: `${URL_REPORTS_ISSUED_LICENSES}${date.read}`,
    statusChangesUrl: `${URL_REPORTS_STATUS_CHANGES}${date.read}`,
    newApplicationsUrl: `${URL_REPORTS_NEW_APPLICATIONS}${date.read}`,
    singleLicenseUrlBase: `${URL_SINGLE_LICENSE}`,
    reportTypes,
  };
}

// ------------------------------

const ZipCodes = [
  {
    name: 'LA_COUNTY',
    from: 90001,
    to: 90899,
  }
];

const Config = {
  START_DAYS_AGO: 3,
  DAYS_RANGE: 7,
  THROTTLE_DELAY_SECONDS: 10,
  IGNORE_INCLUDE_KEYWORDS: true,
  IGNORE_LICENSE_TYPES: false,
  IGNORE_ZIP_CODES: false,
  INCLUDE_KEYWORDS: [
    'bar', 'pool hall', 'poolhall', 'billiards'
  ],
  OMIT_KEYWORDS: [
    'restaurant', 'sushi', 'ramen', 'bar & grill', 'bar and grill',
  ],
  ABC_LICENSE_TYPES: [
    '40', // On-Sale Beer
    '41', // On-Sale Beer & Wine - Eating Place
    '42', // On-Sale Beer & Wine - Public Premises
    '43', // On-Sale Beer and Wine Train
    '44', // On-Sale Beer Fishing Party Boat
    '45', // On-Sale Beer and Wine Boat
    '46', // On-Sale Beer and Wine Airplane
    '47', // On-Sale General - Eating Place
    '48', // On-Sale General - Public Premises
    '49', // On-Sale General - Seasonal
    '51', // Club
    '52', // Veteran's Club
    '53', // On-Sale General Train
    '54', // On-Sale General Boat
    '55', // On-Sale General Airplane
    '56', // On-Sale General Vessel 1000 Tons
    '57', // Special On-Sale General
    '58', // Caterer's Permit
    '59', // On-Sale Beer & Wine - Seasonal
    '60', // On-Sale Beer - Seasonal
    '61', // On-Sale Beer - Public Premises
    '62', // On-Sale General Dockside, 7000 Tons
    '63', // On-Sale Special Beer and Wine Hospital
    '64', // Special On-Sale General for Nonprofit Theater Company
    '65', // Special On-Sale Beer and Wine Symphony
    '67', // Bed and Breakfast Inn
    '68', // Portable Bar License
    '69', // Special On-Sale Beer and Wine Theater
    '70', // On-Sale General - Restrictive Service
    '71', // Special On-Sale General For-Profit Theater within city and county of SF
    '72', // Special On-Sale General For-Profit Theater within county of Napa
    '73', // Special Non-Profit Sales License
    '75', // Brewpub-Restaurant
    '80', // Bed and Breakfast Inn - General
    '88', // Special On-Sale General License For-Profit Cemetary with Specified Characteristics
    '90', // On-Sale General - Music Venue
    '99', // On-Sale General for Special Use
  ],
  Headers: {
    LICENSE_TYPE: 'Type| Dup',
    STATUS: 'Status',
    STATUS_CHANGE: 'Status Changed From/To',
    TRANSFER: 'Transfer-From/To',
    OWNER_DBA: 'Primary Owner and Premises Addr.',
    LICENSE_NUMBER: 'License Number',
    ADDRESS_STREET: 'Prem Street',
    ADDRESS_CITY: 'City',
    ADDRESS_ZIP: 'Zip Code',
    COUNTY_CODE: 'County',
  },
  // status changes seems to subsume issued licenses
  includeReportTypes: {
    ISSUED_LICENSES:    false,  // report TYPE 1
    NEW_APPLICATIONS:   false,  // report TYPE 2
    STATUS_CHANGES:     true,   // report TYPE 3
  },
};

// ------------------------------

type ReportConfig = {
  date: {read: string, write:string},
  saveDir: string,
  downloadPath: string,
  issuedLicensesUrl: string,
  newApplicationsUrl: string,
  statusChangesUrl: string,
  singleLicenseUrlBase: string,
  reportTypes: ReportType[],
};

type ReportType = {
  id: number,
  name: string,
  url: string,
  downloadPath: string,
}

type RecordData = {
  ownerDBA: string,
  license: string,
  licenseType: string,
  transfer?: string,
  transferTo?: string,
  mapsUrl: string,
  licensePageUrl: string,
  rawRecord: any,
}
type ReportDate = {read: string, write: string};

// ------------------------------
const URL_REPORTS_BASE = 'https://www.abc.ca.gov/licensing/licensing-reports';
const URL_LICENSE_LOOKUP_BASE = 'https://www.abc.ca.gov/licensing/license-lookup';

const URL_REPORTS_ISSUED_LICENSES = `${URL_REPORTS_BASE}/issued-licenses/?RPTTYPE=1&RPTDATE=`;
const URL_REPORTS_NEW_APPLICATIONS = `${URL_REPORTS_BASE}/new-applications/?RPTTYPE=2&RPTDATE=`
const URL_REPORTS_STATUS_CHANGES = `${URL_REPORTS_BASE}/status-changes/?RPTTYPE=3&RPTDATE=`;
const URL_SINGLE_LICENSE = `${URL_LICENSE_LOOKUP_BASE}/single-license/?RPTTYPE=12&LICENSE=`;

const SPACES_24 = '                        ';
const REPORT1_DOWNLOAD_FILENAME = 'report-issued-licenses.csv';
const REPORT2_DOWNLOAD_FILENAME = 'report-new-applications.csv';
const REPORT3_DOWNLOAD_FILENAME = 'report-status-changes.csv';
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
