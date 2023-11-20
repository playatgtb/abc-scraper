
const { dir } = require('console');
const fs = require('fs');
const nodemailer = require('nodemailer');
const argv = require('minimist')(process.argv.slice(2));

//------------------------

const main = () => {
  if (fs.existsSync(Config.LAST_MAIL_SENT_FILE)) {
    const fileDate = fs.readFileSync(Config.LAST_MAIL_SENT_FILE, 'utf8');
    if (!isFreshMailDate(fileDate, true)) {
      console.log(`--- Mail already sent this week on (${convertDate(fileDate, true)})`);
      return;
    }
  }

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
    sendEmail(screenshotDirs, screenshotDirUrls);
  }
  else
  // do nothing
  {
    console.log(Config);
  }
}

//------------------------

const sendEmail = (screenshotDirs, screenshotDirUrls) => {
  let emailBodyText;
    if (!screenshotDirUrls.length) {
      emailBodyText = `No screenshots found in the last ${CONFIG_DAYS} days`;
      console.log(emailBodyText);
    } else {
      emailBodyText = Config.EMAIL_HEADER;
      emailBodyText += `${Config.GITHUB_WEEKLY_REPORT_URL_BASE}/email-report-${getReportingDate(0, true)?.write}.md`;
    }
    const dateToday = getReportingDate(0, true)?.write;
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'jhanink@gmail.com',
        pass: Config.GMAIL_PASS_KEY,
      },
    });
    transporter.sendMail({
      ...mailOptions,
      subject: `${mailOptions.subject} ( ${convertDate(dateToday, true)} )`,
      text: emailBodyText,
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
  let content;
  screenshotDirs.forEach((dir, dirIndex) => {
    fs.readdirSync(dir).forEach((file) => {
      if (!file.endsWith('.png')) return;
      console.log({dir, file})
      const license = file.split('.')[0];
      const metadata = fs.readFileSync(`${dir}/${license}.json`);
      const mapsUrl = JSON.parse(metadata).mapsUrl;
      if (!content) content = `## ${license}\n`;
      content += `![View in Maps]](${mapsUrl})\n`;
      content += `![${license}](${screenshotDirUrls[dirIndex]}/${file})\n---\n`;
    });
  });
  const title = '# ABC Scraper Weekly Report';
  content = content ? `${title} (${dateToday.read})\n${content}`
    : `${title}\n\nNo screenshots found in the last ${Config.DAYS_RANGE} days`;
  fs.writeFileSync(`./email-reports/email-report-${dateToday.write}.md`, content);
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

var mailOptions = {
  from: '"ABC Weekly Report" jhanink+abcscraper@gmail.com',
  to:'zergworld+abcscraper@gmail.com',
  //to:'play+abcscraper@gtbilliards.com',
  subject: "GT WEEKLY -- ABC Scraper Weekly Report",
  text: "WORKING",
}

const Config = {
  START_DAYS_AGO: 0,
  DAYS_RANGE: 7,
  SEND_MAIL: true,
  GMAIL_USER: 'jhanink@gmail.com',
  GMAIL_PASS_KEY: 'ryws myub jlnf qexh',
  GITHUB_SCREENSHOTS_URL_BASE: 'https://raw.githubusercontent.com/playatgtb/abc-scraper/main/downloads',
  GITHUB_WEEKLY_REPORT_URL_BASE: 'https://github.com/playatgtb/abc-scraper/tree/main/email-reports',
  LAST_MAIL_SENT_FILE: './LAST_MAIL_DATE',
  EMAIL_REPORTS_DIR: `./email-reports`,
  EMAIL_HEADER: `Hey John,\nThese are the locations that changed hands in the past week. Tap on the link below to learn more about each location.\n\n`,
}

//------------------------
main();
//------------------------
