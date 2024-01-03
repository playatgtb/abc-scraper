const fs = require('fs');
const hubspot = require('@hubspot/api-client');
const nodemailer = require('nodemailer');

//------------------------

const main = () => {
  // configuration options
  Config['DAYS_RANGE'] = Number(process.env.ABC_DAYS || Config.DAYS_RANGE);
  Config['SEND_MAIL'] = Number(process.env.ABC_SEND_MAIL || Config.SEND_MAIL);

  const abTest = process.env.ABC_AB_TEST || Config.AB_TEST;
  Config['AB_TEST_DIR'] = abTest.length ? `${abTest}/` : '';

  const screenshotDirs = [];
  const screenshotDirUrls = [];
  for (let i = 0; i < Config.DAYS_RANGE; i++) {
    const date = getReportingDate(i)?.write;
    const screenshotDir = `./downloads/${Config.AB_TEST_DIR}${date}-screenshots`;
    if (fs.existsSync(screenshotDir)) {
      screenshotDirs.push(screenshotDir);
      screenshotDirUrls.push(`${Config.GITHUB_SCREENSHOTS_URL_BASE}/${Config.AB_TEST_DIR}${date}-screenshots`);
    }
  }

  if (Config.SEND_MAIL === 1) {
    sendEmail(screenshotDirUrls);
  } else if (Config.SEND_MAIL === 0) {
    addScreenshotshotViewer(screenshotDirs, screenshotDirUrls);
  } else {
    console.log(Config);
  }
}

//------------------------

const mailAlreadySent = () => {
  if (fs.existsSync(Config.LAST_MAIL_SENT_FILE)) {
    const fileDate = fs.readFileSync(Config.LAST_MAIL_SENT_FILE, 'utf8');
    if (!isFreshMailDate(fileDate, true)) {
      console.log(`--- Mail already sent this period on (${convertDate(fileDate, true)})`);
      return true;
    }
  }
  return false;
}

const sendEmail = (screenshotDirUrls) => {
  if (mailAlreadySent()) return;
    let emailBodyText;
    if (!screenshotDirUrls.length) {
      emailBodyText = `No screenshots found in the last ${Config.DAYS_RANGE} days`;
      console.log(emailBodyText);
    } else {
      emailBodyText = Config.EMAIL_HEADER;
      emailBodyText += `${Config.GITHUB_WEEKLY_REPORT_URL_BASE}/${Config.AB_TEST_DIR}email-report-${getReportingDate(0, true)?.write}.md`;
    }
    let emailBodyHtml = fs.readFileSync(`${Config.EMAIL_REPORTS_DIR}/${Config.AB_TEST_DIR}email-report-${getReportingDate(0, true)?.write}.html`, 'utf8');
    const mailConfig = getMailConfig();
    if (!mailConfig) {
      console.log("no .mail-config file found");
      return;
    }
    const dateToday = getReportingDate(0, true)?.write;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: mailConfig.MAIL_USER,
        pass: mailConfig.MAIL_PASS_KEY,
      },
    });
    const mailTo = mailConfig.MAIL_TO || mailOptions.to;
    transporter.sendMail({
      ...mailOptions,
      to: mailTo,
      subject: `${mailOptions.subject} ( ${convertDate(dateToday, true)} )`,
      //text: emailBodyText,
      html: emailBodyHtml,
    }, (error, response) => {
      if (error) {
        console.log('Error', error);
      } else {
        // write last mail date to file
        fs.writeFileSync(Config.LAST_MAIL_SENT_FILE, dateToday);
        console.log(`--- Mail Sent: ${mailTo}`);
      }
    });
}

const addScreenshotshotViewer = (screenshotDirs, screenshotDirUrls) => {
  const dateToday = getReportingDate(0, true);
  let markdownContent;
  let htmlContent;
  let count = 0;
  screenshotDirs.forEach((dir, dirIndex) => {
    fs.readdirSync(dir).forEach((file) => {
      if (!file.endsWith('.png')) return;
      console.log({dir, file})
      count++;
      const FILENAME = file.split('.')[0];
      const metadata = JSON.parse(fs.readFileSync(`${dir}/${FILENAME}.json`));
      const mapsUrl = metadata.mapsUrl;
      const license = metadata.transferTo || FILENAME;
      const licenseUrl = `${Config.SINGLE_LICENSE_URL_BASE}${license}`;
      const transfer = metadata.transfer;
      const ownerDbaSplit = metadata.ownerDBA.split('DBA: ');
      const ownerDba = (ownerDbaSplit.length === 2 && ownerDbaSplit[1]) || '';
      markdownContent = markdownContent || '';
      htmlContent = htmlContent || '';
      markdownContent += `### ${license} ${transfer ? `(transfer)` : ''} | [view map](${mapsUrl}) | [view ABC license page](${licenseUrl})\n`;
      markdownContent += `![${license}](${screenshotDirUrls[dirIndex]}/${file})\n---\n`;
      htmlContent +=`
    <div class="item-heading">
      <div class="item-links"><a href="${mapsUrl}">view map</a> | <a href="${licenseUrl}">view license page</a></div><div class="license">${license} ${transfer ? `(transfer)` : ''} &nbsp;&nbsp; ${ownerDba}</div>
    </div>
    <img src="${screenshotDirUrls[dirIndex]}/${file}" width="100%" />`;
    });
  });
  const title = `ABC Scraper - Weekly Report`;
  markdownContent = markdownContent ? `# ${title} - ${count} listings\n ${markdownContent}`
    : `${title}\n\nNo screenshots found in the last ${Config.DAYS_RANGE} days`;
  htmlHead = `
    <style>
      body {color: black}
      .item-heading { margin: 30px 0px 10px }
      .item-heading a {font-family: Helvetica; text-decoration: none; color: orange !important;}
      .item-heading a:hover { color: red !important; }
      .item-links { display: inline-block; font-size: 1.5rem; font-weight: bold; padding: 5px 25px; border: 1px solid black; border-radius: 30px; background-color: black; color: white; }
      .darkgray { color: darkgray; }
      .header { font-size: 1.5rem; }
      .title { font-size: 2rem; color: black;}
      .license { display: inline-block; font-size: 1.5rem; font-weight: bold; color: black; margin: 10px; }
    </style>
  `;
  htmlContent = htmlContent ? `
  <html>
  <head>${htmlHead}</head>
  <body>
    <div class="title">${title} - ${count} listings</div>
    ${htmlContent}
    <div>
      <a href="https://htmlpreview.github.io/?${Config.GITHUB_WEEKLY_REPORT_URL_BASE}/${Config.AB_TEST_DIR}email-report-${dateToday.write}.html">github archive permalink</a>
    </div>
  </body>
  </html>
  `
    : `${title}<br><br>No screenshots found in the last ${Config.DAYS_RANGE} days`;

  const emailReportDir = `./email-reports/${Config.AB_TEST_DIR}`;
  if (!fs.existsSync(emailReportDir)) {
    fs.mkdirSync(emailReportDir, { recursive: true });
  }

  fs.writeFileSync(`${emailReportDir}email-report-${dateToday.write}.md`, markdownContent);
  fs.writeFileSync(`${emailReportDir}email-report-${dateToday.write}.html`, htmlContent);
}

const isFreshMailDate = (fileDay, debug = false) => {
  const today = getReportingDate(0, true).read
  const todayDate = new Date(today);
  const lastMailDate = new Date(fileDay);
  const diffDays = Math.round(Math.abs((todayDate - lastMailDate) / (24 * 3600 * 1000)));
  if (debug) {
    console.log({ today, fileDay, delayDays: Config.DAYS_RANGE, diffDays, debug })
  }
  return diffDays >= Config.DAYS_RANGE;
}

const getReportingDate = (daysAgo, useToday = false) => {
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

const convertDate = (date, toLocalFormat=false) => {
  if (toLocalFormat) {
    const _ = date.split('-');
    return `${_[1].padStart(2, '0')}/${_[2].padStart(2, '0')}/${_[0]}`;
  } else {
    const _ = date.split('/');
    return `${_[2]}-${_[0].padStart(2, '0')}-${_[1].padStart(2, '0')}`;
  }
}

const hubspotTest = async () => {
  const hubspotConfig = fs.existsSync(Config.HUBSPOT_CONFIG_FILE)
    && JSON.parse(fs.readFileSync(Config.HUBSPOT_CONFIG_FILE));

  if (!hubspotConfig) return;
  const hubspotClient = new hubspot.Client({accessToken: hubspotConfig.ACCESS_TOKEN});
  const contactObj = {
    properties: {
        firstname: 'TestFirstName',
        lastname: 'TestLastName',
        email: 'test@testemail.com'
    },
  }

  const taskObj = {
    properties: {
      title: 'Title',
      type: 'Type',
      priority: 'Priority',
      notes: 'Notes',
    }
  }

  const createContactResponse = await hubspotClient.crm.contacts.basicApi.create(contactObj)
  console.log(createContactResponse)
}

/**
 *
 * @returns { MAIL_USER, MAIL_PASS_KEY }
 */
const getMailConfig = () => {
  const filename = `${Config.ROOT_DIR}/${Config.MAIL_CONFIG_FILE}`;
  if (!fs.existsSync(filename)) return {};
  return JSON.parse(fs.readFileSync(filename));
}

var mailOptions = {
  from: '"ABC Weekly Report" play+abcscraper@gtbilliards.com',
  to: [
    'play+abcscraper@gtbilliards.com',
    'jre9754+abcscraper@gmail.com',
    'angelc1225@yahoo.com',
    'zergworld+abcscraper@gmail.com',
  ],
  subject: "GT WEEKLY -- ABC Scraper Weekly Report",
  text: "WORKING",
}

const Config = {
  AB_TEST: '',
  ROOT_DIR: './',
  START_DAYS_AGO: 0,
  DAYS_RANGE: 7,
  SEND_MAIL: 1,
  MAIL_CONFIG_FILE: '.mail-config',
  HUBSPOT_CONFIG_FILE: '.hubspot-config',
  GITHUB_SCREENSHOTS_URL_BASE: 'https://raw.githubusercontent.com/playatgtb/abc-scraper/main/downloads',
  GITHUB_WEEKLY_REPORT_URL_BASE: 'https://github.com/playatgtb/abc-scraper/blob/main/email-reports',
  SINGLE_LICENSE_URL_BASE: `https://www.abc.ca.gov/licensing/license-lookup/single-license/?RPTTYPE=12&LICENSE=`,
  LAST_MAIL_SENT_FILE: './LAST_MAIL_DATE',
  EMAIL_REPORTS_DIR: `./email-reports`,
  EMAIL_HEADER: `Hey John,\nThese are the locations that changed status in the past week. Tap on the link below to learn more about each location.\n\n`,
}

//------------------------
main();
//------------------------
