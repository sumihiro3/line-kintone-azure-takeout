/* eslint-disable no-case-declarations */
const fs = require('fs')
const consola = require('consola')
const Router = require('express-promise-router')
const line = require('@line/bot-sdk')
const queryString = require('query-string')
const { v4: uuidv4 } = require('uuid')
const {
  TextAnalyticsClient,
  AzureKeyCredential
} = require('@azure/ai-text-analytics')
const nodeFetch = require('node-fetch')
const PayTransaction = require('./pay_transaction')
const OrderedItem = require('./ordered_item')
const FollowedUser = require('./followed_user')
const ContactMessage = require('./contact_message')

const API_URL = process.env.API_URL

// Express router
const router = new Router()

// Item master
const ITEMS = JSON.parse(fs.readFileSync('./server/items.json', 'utf8'))

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

// LINE Pay client
let payClient
let useLinePayCheckout = false

// Azure AI
const endpoint = process.env.AZURE_TEXT_ANALYTICS_URL
const key = process.env.AZURE_TEXT_ANALYTICS_KEY
const textAnalyticsClient = new TextAnalyticsClient(
  endpoint,
  new AzureKeyCredential(key)
)

router.post('/webhook', line.middleware(lineConfig), (req, res) => {
  consola.log('Bot webhook called!')
  if (!lineApiClient) {
    lineApiClient = req.app.locals.lineApiClient
  }
  if (!payClient) {
    payClient = req.app.locals.pay
  }
  useLinePayCheckout = req.app.locals.useCheckout
  Promise.all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      consola.error(err)
      res.status(500).end()
    })
})

async function handleEvent(event) {
  consola.log('handleEvent function called!:', event)
  const replyToken = event.replyToken
  if (replyToken && replyToken.match(/^(.)\1*$/)) {
    return consola.log('Test hook received: ' + JSON.stringify(event.message))
  }
  const userId = event.source.userId
  switch (event.type) {
    case 'message':
      const message = event.message
      switch (message.type) {
        case 'text':
          return handleText(message, replyToken, event.source)
        default:
          throw Promise.resolve(null)
      }
    case 'follow':
      const msg = await lineApiClient
        .getProfile(userId)
        .then(async (profile) => {
          const lang = profile.language
          // kintone にuserId とlanguage を登録
          await FollowedUser.registUserInfo(userId, profile.displayName, lang)
          // リッチメニューを設定
          const richmenuId = process.env.LINE_RICH_MENU_DEFAULT_ID
          await lineApiClient.linkRichMenuToUser(userId, richmenuId)
          return '友達登録ありがとうございます'
        })
      return lineApiClient.replyMessage(replyToken, {
        type: 'text',
        text: msg
      })
    case 'postback':
      const data = event.postback.data
      return handlePostback(data, replyToken, userId)
    default:
      throw Promise.resolve(null)
  }
}

function handleText(message, replyToken) {
  const replyMessage = generateContactMessage(message.text)
  return lineApiClient.replyMessage(replyToken, replyMessage)
}

async function handlePostback(data, replyToken, userId) {
  if (data === 'DATE' || data === 'TIME' || data === 'DATETIME') {
    data += `(${JSON.stringify(event.postback.params)})`
  }
  let replyMessage = { type: 'text', text: `Got postback: ${data}` }
  const parsedData = queryString.parse(data)
  if (parsedData.type === 'access') {
    replyMessage = {
      type: 'location',
      title: `Brown's Burger Shop`,
      address: '〒150-0002 東京都渋谷区渋谷２丁目２１−１',
      latitude: 35.65910807942215,
      longitude: 139.70372892916203
    }
  } else if (parsedData.type === 'business-hour') {
    replyMessage = generateBusinessHourMessage()
  } else if (parsedData.type === 'customer-support') {
    lineApiClient.unlinkRichMenuFromUser(userId)
    replyMessage = generateCustomerSupportMessage()
  } else if (parsedData.type === 'send') {
    const message = parsedData.data
    // 問い合わせ内容のポジネガ分析
    const sentimentResult = await textAnalyticsClient.analyzeSentiment([
      { id: '1', language: 'ja', text: message }
    ])
    const sentiment = sentimentResult[0].sentiment
    // 問い合わせ内容の翻訳
    const translationResult = await getTranslateText(message)
    // kintoneに問い合わせ内容と翻訳結果とポジネガ分析結果を登録
    await ContactMessage.registContactInfo(
      userId,
      message,
      sentiment,
      translationResult
    )
    // リッチメニューを設定
    const richmenuId = process.env.LINE_RICH_MENU_DEFAULT_ID
    lineApiClient.linkRichMenuToUser(userId, richmenuId)
    replyMessage = {
      type: 'text',
      text: '送信が完了しました'
    }
  } else if (parsedData.type === 'cancel') {
    // リッチメニューを設定
    const richmenuId = process.env.LINE_RICH_MENU_DEFAULT_ID
    lineApiClient.linkRichMenuToUser(userId, richmenuId)
    replyMessage = {
      type: 'text',
      text: 'キャンセルしました'
    }
  } else if (parsedData.type === 'menu') {
    // 商品選択用のcarouselを表示
    replyMessage = generateItemsMessage()
  } else if (parsedData.type === 'select') {
    // 個数選択用のquickreply を表示
    const itemId = parsedData.item
    replyMessage = generateQuantityMessage(itemId)
  } else if (parsedData.type === 'order') {
    // 注文
    consola.log('Postback Data:', parsedData)
    return doPayRequest(
      userId,
      parsedData.item,
      parsedData.quantity,
      replyToken
    )
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
    text: 'お問合せ内容をご入力ください。',
    quickReply: {
      items: [
        {
          type: 'action',
          action: {
            type: 'postback',
            label: 'メニューに戻る',
            data: 'type=cancel',
            displayText: 'メニューに戻る'
          }
        }
      ]
    }
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
        label: `${i} 個`,
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

function generateContactMessage(data) {
  const msg = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'vertical',
          margin: 'lg',
          spacing: 'sm',
          contents: [
            {
              type: 'text',
              text: '問い合わせ内容確認',
              size: 'sm',
              color: '#aaaaaa'
            },
            {
              type: 'text',
              text: data,
              size: 'sm',
              wrap: true
            }
          ]
        }
      ]
    },
    footer: {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          height: 'sm',
          action: {
            type: 'postback',
            label: '送信',
            data: 'type=send&data=' + data,
            displayText: '送信'
          }
        },
        {
          type: 'button',
          height: 'sm',
          action: {
            type: 'postback',
            label: 'キャンセル',
            data: 'type=cancel',
            displayText: 'キャンセル'
          }
        },
        {
          type: 'spacer',
          size: 'sm'
        }
      ],
      flex: 0
    }
  }
  return {
    type: 'flex',
    altText: '問い合わせ内容確認',
    contents: msg
  }
}

async function getTranslateText(text) {
  const params = [{ text }]
  const url =
    'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=ja'
  const res = await nodeFetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': process.env.AZURE_TRANSLATOR_KEY,
      'Content-type': 'application/json',
      'X-ClientTraceId': uuidv4().toString(),
      'Ocp-Apim-Subscription-Region': 'eastasia'
    },
    body: JSON.stringify(params)
  })
  const json = await res.json()
  return json[0].translations[0].text
}

// 注文情報を生成しLINE Pay Request API を実行して決済処理を始める
async function doPayRequest(userId, itemId, quantity, replyToken) {
  consola.log(
    'doPayRequest function called!:',
    userId,
    itemId,
    quantity,
    replyToken
  )
  let replyMessage = {
    type: 'text',
    text: '決済処理が失敗しました。もう一度、お試しください。'
  }
  // 注文情報を作成する
  const orderId = uuidv4()
  const paymentInfo = generatePaymentInfo(itemId, quantity, orderId)
  let transactionId
  let paymentUrl
  try {
    // LINE Pay API で決済予約
    const payRequestResult = await payClient.request(paymentInfo)
    consola.log('Pay Request Return code:', payRequestResult.returnCode)
    consola.log('Pay Request Return message:', payRequestResult.returnMessage)
    transactionId = payRequestResult.info.transactionId
    paymentUrl = payRequestResult.info.paymentUrl.web
  } catch (error) {
    consola.error('Error at LINE Pay Request API...', error)
    return lineApiClient.replyMessage(replyToken, replyMessage)
  }
  try {
    // Save ordered item information to kintone
    await registOrderedItems(orderId, userId, paymentInfo)
    // Save pay transaction information to kintone
    const tran = await registPayTransaction(
      orderId,
      userId,
      paymentInfo,
      transactionId
    )
    consola.log('Registered transaction info', tran)
    // Generate payment message
    replyMessage = generatePayMessage(
      transactionId,
      paymentUrl,
      itemId,
      quantity,
      paymentInfo
    )
    return lineApiClient.replyMessage(replyToken, replyMessage)
  } catch (error) {
    consola.error('Error at Kintone API...', error)
    return lineApiClient.replyMessage(replyToken, replyMessage)
  }
}

function generatePaymentInfo(itemId, quantity, orderId) {
  consola.log('getItemData function called!:', itemId, quantity)
  const item = getItemData(itemId)
  // 決済する商品情報を生成する
  const product = {
    id: itemId,
    name: item.name,
    imageUrl: item.image,
    quantity,
    price: item.unitPrice
  }
  const totalPrice = calcTotalPrice(item, quantity)
  const packages = [
    {
      id: 'package_id',
      amount: totalPrice,
      name: 'LDC テイクアウト',
      products: [product]
    }
  ]
  const options = {
    amount: totalPrice,
    currency: 'JPY',
    orderId,
    packages,
    redirectUrls: {
      confirmUrl: `${API_URL}/pay/confirm`,
      confirmUrlType: 'SERVER',
      cancelUrl: `${API_URL}/pay/cancel`
    },
    options: {
      display: {
        locale: 'ja',
        checkConfirmUrlBrowser: false
      },
      payment: {
        capture: true
      }
    }
  }
  if (useLinePayCheckout === true) {
    options.options.shipping = {
      type: 'SHIPPING',
      feeInquiryUrl: `${API_URL}/pay/shipping_methods`,
      feeInquiryType: 'CONDITION'
    }
  }
  return options
}

function getItemData(itemId) {
  consola.log('getItemData function called!:', itemId)
  const result = ITEMS.filter(function(item) {
    return item.id === itemId
  })
  return result[0]
}

function calcTotalPrice(item, quantity) {
  consola.log('calcTotalPrice function called!:', item, quantity)
  const totalPrice = Math.floor(item.unitPrice * quantity)
  return totalPrice
}

// 決済情報をkintone に保存する
async function registPayTransaction(
  orderId,
  userId,
  paymentInfo,
  transactionId
) {
  consola.log(
    'registPayTransaction function called!',
    orderId,
    userId,
    transactionId
  )
  consola.log('paymentInfo :', JSON.stringify(paymentInfo))
  let title = paymentInfo.packages[0].products[0].name
  if (paymentInfo.packages[0].products.length > 1) {
    title = title + ' 他'
  }
  const amount = parseInt(paymentInfo.packages[0].amount)
  const tran = await PayTransaction.registOrderedTransaction(
    orderId,
    userId,
    title,
    amount,
    transactionId
  )
  return tran
}

// 注文商品情報をkintone に保存する
async function registOrderedItems(orderId, userId, paymentInfo) {
  consola.log('registOrderedItems function called!', orderId, userId)
  consola.log('paymentInfo :', JSON.stringify(paymentInfo))
  const product = paymentInfo.packages[0].products[0]
  consola.log(`ordered item : ${JSON.stringify(product)}`)
  await OrderedItem.registOrderedItem(
    orderId,
    userId,
    product.id,
    product.name,
    product.price,
    product.quantity
  )
}

// 決済開始用メッセージを生成する
function generatePayMessage(
  transactionId,
  paymentUrl,
  itemId,
  quantity,
  paymentInfo
) {
  consola.log(
    'generatePayMessage function called!',
    transactionId,
    paymentUrl,
    itemId,
    quantity
  )
  consola.log('paymentInfo :', JSON.stringify(paymentInfo))
  // Payment message
  const item = getItemData(itemId)
  const totalPrice = `${calcTotalPrice(item, quantity)} 円`
  const messageText = '商品を購入するには下記のボタンで決済に進んでください'
  const itemPrice = `${item.unitPrice * quantity} 円`
  const itemLabel = `${item.name} [${item.unitPrice}円 × ${quantity}個]`
  const msg = JSON.parse(fs.readFileSync('./server/payMessage.json', 'utf8'))
  msg.body.contents[0].contents[0].contents[0].text = itemLabel
  msg.body.contents[0].contents[0].contents[1].text = itemPrice
  msg.body.contents[1].contents[1].contents[1].text = totalPrice
  msg.footer.contents[0].text = messageText
  msg.footer.contents[1].action.uri = paymentUrl
  const payMessage = {
    type: 'flex',
    altText: messageText,
    contents: msg
  }
  return payMessage
}

module.exports = router
