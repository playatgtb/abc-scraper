import { test, expect } from '@playwright/test';
import * as fs from "fs";
import { parse } from "csv-parse/sync";

  // ABC.ca.gov website
  const Urls = {
    STATUS_CHANGES: 'https://www.abc.ca.gov/licensing/licensing-reports/status-changes/'
  }

const ColumnNames = {
  TRANSFER: 'Transfer-From/To',
  OWNER_AND_ADDRESS: 'Primary Owner and Premises Addr.',
};

const getOwnerDBA = (record: any) => {
  let spaces24 = '                        ';
  return record[ColumnNames.OWNER_AND_ADDRESS].split(spaces24)[0].trim();
}

test('load abc status-change page', async ({ page }) => {

  await page.goto(Urls.STATUS_CHANGES);

  // download today's report
  const button = page.locator('button:has-text("Download Report (CSV)")')
  await expect(button).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await button.click();
  const download = await downloadPromise;
  const date = new Date().toISOString().split('T')[0];
  const file = `./downloads/${date}/report-status-changes.csv`;
  await download.saveAs(file);

  // load records from file
  const records = parse(fs.readFileSync(file), {
    columns: true,
    skip_empty_lines: true,
  });

  let count = 0;
  let owners = {};

  // filter records
  const filtered = records.filter(record => {
    const ownerDBA = getOwnerDBA(record)
    const hasTransfer = record[ColumnNames.TRANSFER].includes('/');

    // ignore duplicates
    if (owners[ownerDBA]) {
      return false;
    }

    owners[ownerDBA] = record;

    // check for transfers and keywords
    return hasTransfer && (
      ownerDBA.match(/bar/i) ||
      ownerDBA.match(/pool hall/i) ||
      ownerDBA.match(/billiards/i)
    );
  });

  console.log(`original records: ${records.length}`);
  console.log(`filtered records: ${filtered.length}`);

  // process records
  for (const record of filtered) {
    // show progress
    const ownerDBA = getOwnerDBA(record);
    console.log(ownerDBA, '-----' , record[ColumnNames.TRANSFER]);
    count++;
  }
});


