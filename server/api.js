const fs = require('fs')
const consola = require('consola')
const Router = require('express-promise-router')
const bodyParser = require('body-parser')
const cors = require('cors')
const PayTransaction = require('./pay_transaction')

// Express router
const router = new Router()
router.use(bodyParser.urlencoded({ extended: true }))
router.use(bodyParser.json())

// Message template
const pushMessage = JSON.parse(
  fs.readFileSync('./server/pushMessage.json', 'utf8')
)
const queueTicketMessage = JSON.parse(
  fs.readFileSync('./server/queueTicketMessage.json', 'utf8')
)
const thankYouMessage = JSON.parse(
  fs.readFileSync('./server/thankYouMessage.json', 'utf8')
)

/*
-------------------------------
Middleware
-------------------------------
*/
const API_KEY = 'API_KEY_000000000'

const apiKeyChecker = function(req, res, next) {
  consola.log('apiKeyChecker called!!')
  consola.log('Request Headers', req.headers)
  const apiKey = req.headers.authorization
  if (API_KEY !== apiKey) {
    res.status(401).json({ message: 'Auth failed...' })
  } else {
    // Pass authorization
    next()
  }
}

/*
-------------------------------
APIs
-------------------------------
*/

router.get('/test', cors(), (req, res, next) => {
  const param = { test: 'success' }
  res.header('Content-Type', 'application/json; charset=utf-8')
  res.send(param)
})

router.post(
  '/sendMulticastMessage',
  cors(),
  apiKeyChecker,
  async (req, res) => {
    consola.log('POST sendMulticastMessage called!')
    const data = req.body
    consola.log('Received Data', data)
    const userIds = data.userIds
    const messageTitle = data.message.title
    const messageBody = data.message.body
    const message = generatePushMessage(messageTitle, messageBody)
    try {
      const lineApiClient = req.app.locals.lineApiClient
      await lineApiClient.multicast(userIds, message)
      res.status(200).json({
        code: 'OK',
        message: 'Success!!!!'
      })
    } catch (error) {
      consola.error('Error in multicast', error)
      res.status(400).json({
        code: 'NG',
        message: 'Bad Request...'
      })
    }
  }
)

function generatePushMessage(title, body) {
  const msg = JSON.parse(JSON.stringify(pushMessage))
  msg.body.contents[0].text = title
  msg.body.contents[1].contents[0].text = body
  // Overwrite LIFF URL
  const liffUrl = `https://liff.line.me/${process.env.LIFF_ID}`
  consola.info('LIFF URL', liffUrl)
  msg.footer.contents[0].action.uri = liffUrl
  return {
    type: 'flex',
    altText: title,
    contents: msg
  }
}

const DELIVERY_STATE_PREPARING = 'PREPARING'
const DELIVERY_STATE_READY = 'READY'
const DELIVERY_STATE_DELIVERED = 'DELIVERED'
const DELIVERY_STATES = [
  DELIVERY_STATE_PREPARING,
  DELIVERY_STATE_READY,
  DELIVERY_STATE_DELIVERED
]

router.post('/notifyOrderDeliveryState', async (req, res) => {
  consola.log('POST notifyOrderDeliveryState called!')
  const data = req.body
  consola.log('Received Data', data)
  const orderId = data.orderId
  const deliveryState = data.deliveryState
  let apiResult = {
    code: '0000',
    message: 'SUCCESS'
  }
  try {
    if (!DELIVERY_STATES.includes(deliveryState)) {
      throw new Error('Invalid State code')
    }
    const transaction = await PayTransaction.getTransaction(orderId)
    const userId = transaction.userId
    const lineApiClient = req.app.locals.lineApiClient
    switch (deliveryState) {
      case DELIVERY_STATE_READY:
        // eslint-disable-next-line no-case-declarations
        const readyMessage = generateTakeoutReadyMessage(transaction)
        lineApiClient.pushMessage(userId, readyMessage)
        break
      case DELIVERY_STATE_DELIVERED:
        // eslint-disable-next-line no-case-declarations
        const thankYouMessage = generateThankYouMessage()
        lineApiClient.pushMessage(userId, thankYouMessage)
        break
      default:
        consola.console.warn('No suitable message')
        break
    }
  } catch (error) {
    consola.error('notifyOrderDeliveryState Failed...', error)
    apiResult = {
      code: '9999',
      message: 'FAILED'
    }
  } finally {
    res.status(200).json(apiResult)
  }
})

function generateTakeoutReadyMessage(transaction) {
  consola.log('generateTakeoutReadyMessage called!')
  const msg = JSON.parse(JSON.stringify(queueTicketMessage))
  msg.body.contents[0].text = transaction.recordId
  msg.body.contents[2].text = transaction.title
  return {
    type: 'flex',
    altText: '商品の準備ができました',
    contents: msg
  }
}

function generateThankYouMessage() {
  consola.log('generateThankYouMessage called!')
  const msg = JSON.parse(JSON.stringify(thankYouMessage))
  return {
    type: 'flex',
    altText: 'ご利用ありがとうございました',
    contents: msg
  }
}
module.exports = router
