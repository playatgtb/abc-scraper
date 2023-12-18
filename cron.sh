# 
# 0 5 * * 1 cd /Users/goodtimes/projects/gt/abc-scraper && ./cron.sh
#

source /Users/goodtimes/.zprofile
git pull origin main
npm i
npm run weekly

