
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/Users/goodtimes/Library/Caches/fnm_multishells/17084_1702916903408/bin:/Users/goodtimes/Library/Application Support/fnm:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:$PATH"

echo date > ~/Desktop/cron.log
echo "$USER" >> ~/Desktop/cron.log


git pull origin main
npm i

npm run weekly
echo "-- ran weekly" >> ~/Desktop/cron.log

#npm run weekly-a
#echo "-- ran weekly-a" >> ~/Desktop/cron.log

