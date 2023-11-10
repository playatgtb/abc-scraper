
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

  const days = argv._.length && argv._[0] || Config.DAYS_RANGE;
  const mailText = [];
  for (let i = 0; i < days; i++) {
    const date = getReportingDate(i)?.write;
    const screenshotDir = `./downloads/${date}-screenshots`;
    if (fs.existsSync(screenshotDir)) {
      mailText.push(`${Config.GITHUB_SCREENSHOTS_URL}${date}-screenshots`);
    }
  }

  if (Config.SEND_MAIL ) {
    if (!mailText.length) {
      console.log(`--- No screenshots found in the last ${days} days`);
      return;
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
      subject: `${mailOptions.subject} ( ${dateToday} )`,
      text: mailText.join('\n'),
    }, (error, response) => {
      if (error) {
        console.log('Error', error);
      } else {
        // write last mail date to file
        fs.writeFileSync(Config.LAST_MAIL_SENT_FILE, dateToday);
        console.log('--- Mail Sent');
      }
    });
  } else {
    console.log(Config);
  }
}

//------------------------

const isFreshMailDate = (fileDay, debug = false) => {
  const today = getReportingDate(0, true).read
  const todayDate = new Date(today);
  const lastMailDate = new Date(fileDay);
  const diffDays = Math.round(Math.abs((todayDate - lastMailDate) / (24 * 3600 * 1000)));
  if (debug) {
    console.log({ today, fileDay, delayDays: Config.DAYS_RANGE, diffDays, debug })
  }
  return diffDays > Config.DAYS_RANGE;
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
  from: 'jhanink+abcscraper@gmail.com',
  to:'zergworld+abcscraper@gmail.com',
  //to:'play+abcscraper@gtbilliards.com',
  subject: "Weekly ABC Scraper Report",
  text: "WORKING",
}

const Config = {
  START_DAYS_AGO: 0,
  DAYS_RANGE: 14,
  SEND_MAIL: true,
  GMAIL_USER: 'jhanink@gmail.com',
  GMAIL_PASS_KEY: 'ryws myub jlnf qexh',
  GITHUB_SCREENSHOTS_URL: 'https://github.com/playatgtb/abc-scraper/tree/main/downloads/',
  LAST_MAIL_SENT_FILE: './LAST_MAIL_DATE',
}

//------------------------
main();
//------------------------
