'use strict'

const Router = require('express-promise-router')
const bodyParser = require('body-parser')
const consola = require('consola')
const moment = require('moment')
const PayTransaction = require('./pay_transaction')

const SHIPPING_METHODS = [
  {
    id: 'shipping_01',
    name: 'ウーハーイート',
    amount: 2,
    toDeliveryYmd: ''
  },
  {
    id: 'shipping_02',
    name: '出前便',
    amount: 1,
    toDeliveryYmd: ''
  }
]

// Express router
const router = new Router()
router.use(bodyParser.urlencoded({ extended: true }))
router.use(bodyParser.json())

// LINE Pay 側からのconfirmUrl へのリクエストを受け付ける
router.get('/confirm', async (req, res, next) => {
  consola.log(`/pay/confirm called!`)
  const orderId = req.query.orderId
  const transactionId = req.query.transactionId
  let shippingFeeAmount = req.query.shippingFeeAmount
  if (!shippingFeeAmount) {
    shippingFeeAmount = 0
  }
  let shippingMethodId = req.query.shippingMethodId
  if (shippingMethodId) {
    const method = getShippingMethodByID(shippingMethodId)
    shippingMethodId = method.name
  }
  consola.log(`orderId is ${orderId}`)
  consola.log(`transactionId is ${transactionId}`)
  consola.log(`shippingFeeAmount is ${shippingFeeAmount}`)
  consola.log(`shippingMethodId is ${shippingMethodId}`)
  // update pay transaction
  let transaction = await PayTransaction.getTransaction(orderId)
  if (!transaction) {
    throw new Error('Transaction not found.')
  }
  // Update Transaction info
  transaction = await transaction.updateShippingInfo(
    shippingMethodId,
    shippingFeeAmount
  )
  consola.log(`Retrieved following transaction.`)
  consola.log(transaction)
  // Prepare confirm API params
  let amount = transaction.amount
  if (transaction.shippingFeeAmount && transaction.shippingMethod) {
    amount += transaction.shippingFeeAmount
  }
  const options = {
    transactionId,
    amount,
    currency: transaction.currency
  }
  // Call LINE Pay Confirm API
  consola.log(`Going to confirm payment with following options.`)
  consola.log(options)
  const pay = req.app.locals.pay
  pay
    .confirm(options)
    .then(async (response) => {
      consola.log(`LINE Pay Confirm API Response: ${JSON.stringify(response)}`)
      // 決済完了とする
      transaction = await transaction.setPaid(moment())
      consola.log(`Payment done: ${JSON.stringify(transaction)}`)
      // 領収書メッセージを返す
      const receiptMessage = generateReceiptMessage(transaction)
      const lineApiClient = req.app.locals.lineApiClient
      return lineApiClient.pushMessage(transaction.userId, receiptMessage)
    })
    .catch((error) => {
      consola.log(`Error at LINE Pay Confirm API: ${error}`)
      res.status(500).send('NG')
    })
})

function generateReceiptMessage(transaction) {
  consola.log(`function generateReceiptMessage called!`)
  const messageText = '領収書'
  const transactionId = transaction.transactionId
  let amount = transaction.amount
  if (transaction.shippingFeeAmount && transaction.shippingMethod) {
    amount += transaction.shippingFeeAmount
  } else {
    transaction.shippingFeeAmount = 0
  }
  const totalAmount = `${amount} 円`
  const shippingFeeAmount = `${transaction.shippingFeeAmount} 円`
  // お買い上げ金額
  const productRows = [
    {
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: transaction.title,
          size: 'sm',
          color: '#555555',
          flex: 0
        },
        {
          type: 'text',
          text: `${transaction.amount} 円`,
          size: 'sm',
          color: '#111111',
          align: 'end'
        }
      ]
    }
  ]

  // 領収書メッセージ本体
  const bubble = {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: messageText,
          weight: 'bold',
          color: '#1DB446',
          size: 'sm'
        },
        {
          type: 'text',
          text: 'LDC テイクアウト',
          weight: 'bold',
          size: 'xxl',
          margin: 'md'
        },
        {
          type: 'text',
          text: 'お買い上げありがとうございました！',
          size: 'sm',
          margin: 'sm'
        },
        {
          type: 'separator',
          margin: 'xxl'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'xxl',
          spacing: 'sm',
          contents: productRows
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'xxl',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '送料',
                  size: 'sm',
                  color: '#555555',
                  flex: 0
                },
                {
                  type: 'text',
                  text: shippingFeeAmount,
                  size: 'sm',
                  color: '#111111',
                  align: 'end'
                }
              ]
            }
          ]
        },
        {
          type: 'separator',
          margin: 'xxl'
        },
        {
          type: 'box',
          layout: 'vertical',
          margin: 'md',
          contents: [
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                {
                  type: 'text',
                  text: '合計',
                  size: 'md',
                  color: '#555555'
                },
                {
                  type: 'text',
                  text: totalAmount,
                  size: 'lg',
                  color: '#111111',
                  align: 'end',
                  weight: 'bold'
                }
              ]
            }
          ]
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'md',
          contents: [
            {
              type: 'text',
              text: 'PAYMENT ID',
              size: 'xs',
              color: '#aaaaaa',
              flex: 0
            },
            {
              type: 'text',
              text: transactionId,
              color: '#aaaaaa',
              size: 'xs',
              align: 'end'
            }
          ]
        }
      ]
    },
    styles: {
      footer: {
        separator: true
      }
    }
  }
  const message = {
    type: 'flex',
    altText: messageText,
    contents: bubble
  }
  return message
}

router.get('/cancel', (req, res, next) => {
  consola.log(`/pay/cancel called!: ${req}`)
})

router.post('/shipping_methods', (req, res, next) => {
  consola.log(`/pay/shipping_methods called!`)
  consola.log(`req.body: ${JSON.stringify(req.body)}`)
  // 配送日
  const deliveryDate = moment()
  const dt = deliveryDate.format('YYYYMMDD')
  const shippingMethods = SHIPPING_METHODS.map((m) => {
    m.toDeliveryYmd = dt
    return m
  })
  const response = {
    returnCode: '0000',
    returnMessage: 'OK',
    info: {
      shippingMethods
    }
  }
  res.json(response)
})

function getShippingMethodByID(id) {
  const methods = SHIPPING_METHODS.filter((m) => {
    return m.id === id
  })
  return methods.length > 0 ? methods[0] : null
}

module.exports = router
