/* eslint-disable no-case-declarations */
const fs = require('fs')
const consola = require('consola')
const Router = require('express-promise-router')
const line = require('@line/bot-sdk')
const queryString = require('query-string')

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

async function handleEvent(event) {
  if (event.replyToken && event.replyToken.match(/^(.)\1*$/)) {
    return consola.log('Test hook received: ' + JSON.stringify(event.message))
  }
  switch (event.type) {
    case 'message':
      const message = event.message
      switch (message.type) {
        case 'text':
          return handleText(message, event.replyToken, event.source)
        default:
          throw Promise.resolve(null)
      }
    case 'postback':
      const data = event.postback.data
      return handlePostback(data, event.replyToken)
    case 'follow':
      const msg = await lineApiClient
        .getProfile(event.source.userId)
        .then((profile) => {
          const lang = profile.language
          // TODO: kintoneにuuidとlanguageを登録
          if (lang === 'ja') {
            return '友達登録ありがとうございます'
          } else {
            return 'Thank you for your following'
          }
        })
      return lineApiClient.replyMessage(event.replyToken, {
        type: 'text',
        text: msg
      })
    default:
      throw Promise.resolve(null)
  }
}

function handleText(message, replyToken) {
  let replyMessage = { type: 'text', text: message.text }
  const msg = {
    type: 'text',
    text: '以下のお問合せ内容で送信してもよろしいですか？ ' + message.text
  }
  replyMessage = msg
  return lineApiClient.replyMessage(replyToken, replyMessage)
}

function handlePostback(data, replyToken) {
  if (data === 'DATE' || data === 'TIME' || data === 'DATETIME') {
    data += `(${JSON.stringify(event.postback.params)})`
  }
  let replyMessage = { type: 'text', text: `Got postback: ${data}` }
  const parsedData = queryString.parse(data)
  if (parsedData.type === 'access') {
    replyMessage = {
      type: 'location',
      title: 'my location',
      address: '〒150-0002 東京都渋谷区渋谷２丁目２１−１',
      latitude: 35.65910807942215,
      longitude: 139.70372892916203
    }
  } else if (parsedData.type === 'business-hour') {
    replyMessage = generateBusinessHourMessage()
  } else if (parsedData.type === 'customer-support') {
    // TODO: リッチメニュー解除
    replyMessage = generateCustomerSupportMessage()
  } else if (parsedData.type === 'menu') {
    // 商品選択用のcarouselを表示
    // TODO: categoryを表示
    replyMessage = generateItemsMessage()
  } else if (parsedData.type === 'select') {
    // 個数選択用のquickreplyを表示
    const itemId = parsedData.item
    replyMessage = generateQuantityMessage(itemId)
  } else if (parsedData.type === 'order') {
    // 注文
  }
  return lineApiClient.replyMessage(replyToken, replyMessage)
}

function generateBusinessHourMessage() {
  const msg = JSON.parse(
    fs.readFileSync('./server/businessHourMessage.json', 'utf8')
  )
  return {
    type: 'flex',
    altText: '営業時間',
    contents: msg
  }
}

function generateCustomerSupportMessage() {
  return {
    type: 'text',
    text: 'お問合せ内容をご入力ください。'
  }
}

function generateItemsMessage() {
  const msg = JSON.parse(fs.readFileSync('./server/itemsMessage.json', 'utf8'))
  return {
    type: 'flex',
    altText: 'メニュー',
    contents: msg
  }
}

function generateQuantityMessage(itemId) {
  const items = []
  for (let i = 1; i < 6; i++) {
    const button = {
      type: 'action',
      action: {
        type: 'postback',
        label: `${i}個`,
        data: `type=order&item=${itemId}&quantity=${i}`,
        displayText: `${i}個`
      }
    }
    items.push(button)
  }
  return {
    type: 'text',
    text: 'いくつ注文する？',
    quickReply: {
      items
    }
  }
}

module.exports = router
