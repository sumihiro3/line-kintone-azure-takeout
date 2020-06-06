const express = require('express')
const consola = require('consola')
const { Nuxt, Builder } = require('nuxt')
const line = require('@line/bot-sdk')
const config = require('../nuxt.config.js')
const apiRouter = require('./api')
const botRouter = require('./bot')
const payRouter = require('./pay')
const app = express()

// Import and Set Nuxt.js options
config.dev = process.env.NODE_ENV !== 'production'

// Show environment values
consola.log('NODE_ENV', process.env.NODE_ENV)
consola.log('API_URL', process.env.API_URL)
consola.log('USE_VCONSOLE', process.env.USE_VCONSOLE)
consola.log('SKIP_LOGIN', process.env.SKIP_LOGIN)
consola.log('LIFF_ID', process.env.LIFF_ID)
consola.log(
  'LINE_BOT_CHANNEL_ACCESS_TOKEN',
  process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN
)
consola.log('LINE_BOT_CHANNEL_SECRET', process.env.LINE_BOT_CHANNEL_SECRET)
consola.log('LINE_PAY_CHANNEL_ID', process.env.LINE_PAY_CHANNEL_ID)
consola.log('LINE_PAY_CHANNEL_SECRET', process.env.LINE_PAY_CHANNEL_SECRET)
consola.log('KINTONE_DOMAIN_NAME', process.env.KINTONE_DOMAIN_NAME)
consola.log('KINTONE_USER_ID', process.env.KINTONE_USER_ID)
consola.log('KINTONE_USER_PASSWORD', process.env.KINTONE_USER_PASSWORD)
consola.log(
  'KINTONE_FOLLOWED_USER_APP_ID',
  process.env.KINTONE_FOLLOWED_USER_APP_ID
)
consola.log('KINTONE_ORDER_ITEM_APP_ID', process.env.KINTONE_ORDER_ITEM_APP_ID)
consola.log(
  'KINTONE_TRANSACTION_APP_ID',
  process.env.KINTONE_TRANSACTION_APP_ID
)
consola.log('KINTONE_INQUIRY_APP_ID', process.env.KINTONE_INQUIRY_APP_ID)
consola.log('LINE_RICH_MENU_DEFAULT_ID', process.env.LINE_RICH_MENU_DEFAULT_ID)
consola.log('KINTONE_INQUIRY_APP_ID', process.env.KINTONE_INQUIRY_APP_ID)
consola.log('USE_AZURE_AI', process.env.USE_AZURE_AI)
consola.log('AZURE_TEXT_ANALYTICS_URL', process.env.AZURE_TEXT_ANALYTICS_URL)
consola.log('AZURE_TEXT_ANALYTICS_KEY', process.env.AZURE_TEXT_ANALYTICS_KEY)
consola.log('AZURE_TRANSLATOR_KEY', process.env.AZURE_TRANSLATOR_KEY)

// LINE Bot
const lineConfig = {
  channelAccessToken: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_BOT_CHANNEL_SECRET
}
const lineApiClient = new line.Client(lineConfig)
app.locals.lineApiClient = lineApiClient

// Use LINE Pay Checkout API or not
consola.log(`useCheckout: ${process.env.LINE_PAY_USE_CHECKOUT}`)
const useCheckout = process.env.LINE_PAY_USE_CHECKOUT === 'true'
app.locals.useCheckout = useCheckout
// LINE Pay API SDK の初期化
const LinePay = require('./line-pay/line-pay')
const pay = new LinePay({
  channelId: process.env.LINE_PAY_CHANNEL_ID,
  channelSecret: process.env.LINE_PAY_CHANNEL_SECRET,
  isSandbox: !useCheckout
})
app.locals.pay = pay

async function start() {
  // Init Nuxt.js
  const nuxt = new Nuxt(config)

  const { host, port } = nuxt.options.server

  await nuxt.ready()
  // Build only in dev mode
  if (config.dev) {
    const builder = new Builder(nuxt)
    await builder.build()
  }
  app.use('/api', apiRouter)
  app.use('/bot', botRouter)
  app.use('/pay', payRouter)

  // Give nuxt middleware to express
  app.use(nuxt.render)

  // Listen the server
  if (process.env.NODE_ENV === 'development') {
    // enable HTTPS on localhost when development mode
    const fs = require('fs')
    const https = require('https')
    // https config
    const httpsOptions = {
      key: fs.readFileSync(`${__dirname}/localhost-key.pem`),
      cert: fs.readFileSync(`${__dirname}/localhost.pem`)
    }
    https.createServer(httpsOptions, app).listen(port, host)
    consola.ready({
      message: `Server listening on https://${host}:${port}`,
      badge: true
    })
  } else {
    app.listen(port, host)
    consola.ready({
      message: `Server listening on http://${host}:${port}`,
      badge: true
    })
  }
}
start()
