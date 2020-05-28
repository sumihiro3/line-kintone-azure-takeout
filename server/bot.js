/* eslint-disable no-case-declarations */
const fs = require('fs')
const consola = require('consola')
const Router = require('express-promise-router')
const line = require('@line/bot-sdk')

// Express router
const router = new Router()

// LINE
const lineConfig = {
  channelAccessToken: process.env.LINE_BOT_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_BOT_CHANNEL_SECRET
}
let lineApiClient
const followMessage = JSON.parse(
  fs.readFileSync('./server/followMessage.json', 'utf8')
)
consola.info('follow Flex Message', followMessage)

router.post('/webhook', line.middleware(lineConfig), (req, res) => {
  consola.log('Bot webhook called!')
  if (!lineApiClient) {
    lineApiClient = req.app.locals.lineApiClient
  }
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      consola.error(err)
      res.status(500).end()
    })
})

function handleEvent(event) {
  if (event.replyToken && event.replyToken.match(/^(.)\1*$/)) {
    return consola.log('Test hook received: ' + JSON.stringify(event.message))
  }
  switch (event.type) {
    case 'message':
      const message = event.message
      switch (message.type) {
        case 'text':
          return handleText(message, event.replyToken, event.source)
        case 'postback':
          let data = event.postback.data
          if (data === 'DATE' || data === 'TIME' || data === 'DATETIME') {
            data += `(${JSON.stringify(event.postback.params)})`
          }
          const msg = { type: 'text', text: `Got postback: ${data}` }
          return lineApiClient.replyMessage(event.replyToken, msg)
        default:
          throw Promise.resolve(null)
      }
    case 'follow':
      const msg = generateFollowMessage('Thank you for your following')
      return lineApiClient.replyMessage(event.replyToken, msg)
    default:
      throw Promise.resolve(null)
  }
}

function handleText(message, replyToken) {
  const echo = { type: 'text', text: message.text }
  return lineApiClient.replyMessage(replyToken, echo)
}

function generateFollowMessage(text) {
  const msg = JSON.parse(JSON.stringify(followMessage))
  // Overwrite LIFF URL
  const liffUrl = `https://liff.line.me/${process.env.LIFF_ID}`
  consola.info('LIFF URL', liffUrl)
  msg.footer.contents[0].action.uri = liffUrl
  return {
    type: 'flex',
    altText: text,
    contents: msg
  }
}

module.exports = router
