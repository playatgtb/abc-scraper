
const fs = require('fs');
const nodemailer = require('nodemailer');
const argv = require('minimist')(process.argv.slice(2));

//------------------------

const main = () => {
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
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'jhanink@gmail.com',
        pass: Config.GMAIL_PASS_KEY,
      },
    });
    transporter.sendMail({
      ...mailOptions,
      text: mailText.join('\n'),
    }, (error, response) => {
      if (error) {
        console.log('Error', error);
      } else {
        console.log('--- Mail Sent');
      }
    });
  } else {
    console.log(Config);
  }
}

//------------------------

const getReportingDate = (daysAgo) => {
  const tempDate = new Date();
  tempDate.setDate(tempDate.getDate() - Math.max(Config.START_DAYS_AGO, 3) - daysAgo);
  const date = tempDate.toISOString().split('T')[0];
  const _ = date.split('-');
  return {
    read: `${_[1]}/${_[2]}/${_[0]}`,
    write: date,
  };
}

var mailOptions = {
  from: 'jhanink+abcscraper@gmail.com',
  to:'zergworld+abcscraper@gmail.com',
  //to:'play+abcscraper@gtbilliards.com',
  subject: "test nodemailer",
  text: "WORKING",
}

const Config = {
  START_DAYS_AGO: 0,
  DAYS_RANGE: 7,
  SEND_MAIL: true,
  GMAIL_USER: 'jhanink@gmail.com',
  GMAIL_PASS_KEY: 'ryws myub jlnf qexh',
  GITHUB_SCREENSHOTS_URL: 'https://github.com/playatgtb/abc-scraper/tree/main/downloads/'
}

//------------------------
main();
//------------------------
