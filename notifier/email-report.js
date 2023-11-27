
const fs = require('fs');
const nodemailer = require('nodemailer');
const argv = require('minimist')(process.argv.slice(2));

//------------------------

const main = () => {


  // CLI Input Options
  // rolling report period days, e.g.: 7
  const CONFIG_DAYS = argv._.length && argv._[0] || Config.DAYS_RANGE;
  // mode: 0 | 1
  const CONFIG_MODE_ADD_VIEWER = !!(argv._.length > 1 && argv._[1]);

  const screenshotDirs = [];
  const screenshotDirUrls = [];
  for (let i = 0; i < CONFIG_DAYS; i++) {
    const date = getReportingDate(i)?.write;
    const screenshotDir = `./downloads/${date}-screenshots`;
    if (fs.existsSync(screenshotDir)) {
      screenshotDirs.push(screenshotDir);
      screenshotDirUrls.push(`${Config.GITHUB_SCREENSHOTS_URL_BASE}/${date}-screenshots`);
    }
  }

  if (CONFIG_MODE_ADD_VIEWER)
  // MODE 1 - add screenshot viewer
  {
    addScreenshotshotViewer(screenshotDirs, screenshotDirUrls);
  }
  else if (Config.SEND_MAIL)
  // MODE 0 - send mail notification
  {
    sendEmail(screenshotDirUrls);
  }
  else
  // do nothing
  {
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
      emailBodyText = `No screenshots found in the last ${CONFIG_DAYS} days`;
      console.log(emailBodyText);
    } else {
      emailBodyText = Config.EMAIL_HEADER;
      emailBodyText += `${Config.GITHUB_WEEKLY_REPORT_URL_BASE}/email-report-${getReportingDate(0, true)?.write}.md`;
    }
    let emailBodyHtml = fs.readFileSync(`${Config.EMAIL_REPORTS_DIR}/email-report-${getReportingDate(0, true)?.write}.html`, 'utf8');
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
    transporter.sendMail({
      ...mailOptions,
      to: mailConfig.MAIL_TO || mailOptions.to,
      subject: `${mailOptions.subject} ( ${convertDate(dateToday, true)} )`,
      //text: emailBodyText,
      html: emailBodyHtml,
    }, (error, response) => {
      if (error) {
        console.log('Error', error);
      } else {
        // write last mail date to file
        fs.writeFileSync(Config.LAST_MAIL_SENT_FILE, dateToday);
        console.log('--- Mail Sent');
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
      const licenseUrl = `${Config.SINGLE_LICENSE_ULR_BASE}${license}`;
      const transfer = metadata.transfer;
      markdownContent = markdownContent || '';
      htmlContent = htmlContent || '';
      markdownContent += `### ${license} ${transfer ? `(transfer)` : ''} | [view map](${mapsUrl}) | [view license page](${licenseUrl})\n`;
      htmlContent += `<div class="item-heading"><div class="item-links"> <a href="${mapsUrl}">view map</a> | <a href="${licenseUrl}">view license page</a></div><div class="license">${license} ${transfer ? `(transfer)` : ''}</div></div>\n`;
      markdownContent += `![${license}](${screenshotDirUrls[dirIndex]}/${file})\n---\n`;
      htmlContent += `<img src="${screenshotDirUrls[dirIndex]}/${file}" width="100%" />`;
    });
  });
  const title = `ABC Scraper - Weekly Report`;
  markdownContent = markdownContent ? `# ${title} - ${count} listings\n ${markdownContent}`
    : `${title}\n\nNo screenshots found in the last ${Config.DAYS_RANGE} days`;
  htmlHead = `
    <style>
      body {color: black}
      .item-heading a {text-decoration: none; color: orange !important;}
      .item-heading a:hover { color: red !important; }
      .darkgray { color: darkgray; }
      .header { font-size: 1.5rem; }
      .title { font-size: 2rem; color: black;}
      .item-links { display: inline-block; font-size: 1.5rem; font-weight: bold; padding: 5px 25px; border: 1px solid black; border-radius: 30px; background-color: black; color: white; }
      .item-heading { margin: 30px 0px 10px }
      .license { display: inline-block; font-size: 1.5rem; font-weight: bold; color: black; margin: 10px; }
    </style>
  `;
  htmlContent = htmlContent ? `
  <html>
  <head>${htmlHead}</head>
  <body>
    <div class="title">${title} - ${count} listings</div>
    ${htmlContent}
  </body>
  </html>
  `
    : `${title}<br><br>No screenshots found in the last ${Config.DAYS_RANGE} days`;
  fs.writeFileSync(`./email-reports/email-report-${dateToday.write}.md`, markdownContent);
  fs.writeFileSync(`./email-reports/email-report-${dateToday.write}.html`, htmlContent);
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

/**
 *
 * @returns { MAIL_USER, MAIL_PASS_KEY }
 */
const getMailConfig = () => {
  const filename = `${Config.DOWNLOADS_DIR}/${Config.MAIL_CONFIG_FILE}`;
  if (!fs.existsSync(filename)) return;
  return JSON.parse(fs.readFileSync(filename));
}

var mailOptions = {
  from: '"ABC Weekly Report" play+abcscraper@gtbilliards.com',
  to:[
    //'zergworld+abcscraper@gmail.com',
    'play+abcscraper@gtbilliards.com',
    'jre9754+abcscraper@gmail.com',
  ],
  subject: "GT WEEKLY -- ABC Scraper Weekly Report",
  text: "WORKING",
}

const Config = {
  DOWNLOADS_DIR: './',
  START_DAYS_AGO: 0,
  DAYS_RANGE: 7,
  SEND_MAIL: true,
  MAIL_CONFIG_FILE: '.mail-config',
  GITHUB_SCREENSHOTS_URL_BASE: 'https://raw.githubusercontent.com/playatgtb/abc-scraper/main/downloads',
  GITHUB_WEEKLY_REPORT_URL_BASE: 'https://github.com/playatgtb/abc-scraper/tree/main/email-reports',
  SINGLE_LICENSE_ULR_BASE: `https://www.abc.ca.gov/licensing/license-lookup/single-license/?RPTTYPE=12&LICENSE=`,
  LAST_MAIL_SENT_FILE: './LAST_MAIL_DATE',
  EMAIL_REPORTS_DIR: `./email-reports`,
  EMAIL_HEADER: `Hey John,\nThese are the locations that changed status in the past week. Tap on the link below to learn more about each location.\n\n`,
}

//------------------------
main();
//------------------------
