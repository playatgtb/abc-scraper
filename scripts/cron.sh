
export PATH=/opt/homebrew/bin:/opt/homebrew/sbin:/Users/goodtimes/Library/Caches/fnm_multishells/17084_1702916903408/bin:/Users/goodtimes/Library/Application Support/fnm:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin

echo "$USER" > ~/Desktop/cron.log && echo "$PATH" >> ~/Desktop/cron.log
echo "$(which npm)" >> ~/Desktop/cron.log

git pull origin main
npm i
npm run weekly

