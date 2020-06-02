const consola = require('consola')
const kintone = require('@kintone/kintone-js-sdk')

const DOMAIN_NAME = process.env.KINTONE_DOMAIN_NAME
const KINTONE_USER_ID = process.env.KINTONE_USER_ID
const KINTONE_USER_PASSWORD = process.env.KINTONE_USER_PASSWORD
const APP_ID = process.env.KINTONE_ORDER_ITEM_APP_ID

/*
    注文情報
    - order_id
    - user_id
    - item_id
    - item_name
    - unit_price
    - quantity
*/
module.exports = class OrderedItem {
  constructor(orderId, userId) {
    this.orderId = orderId
    this.userId = userId
  }

  // kintone の認証
  static auth() {
    consola.log(`auth called!`)
    // kintone Authentication
    const kintoneAuth = new kintone.Auth()
    kintoneAuth.setPasswordAuth({
      username: KINTONE_USER_ID,
      password: KINTONE_USER_PASSWORD
    })
    // kintoneAuth.setApiToken({ apiToken: API_TOKEN })
    consola.log(`kintoneAuth: ${kintoneAuth}`)
    const kintoneConnection = new kintone.Connection({
      domain: DOMAIN_NAME,
      auth: kintoneAuth
    })
    const kintoneRecord = new kintone.Record({ connection: kintoneConnection })
    return kintoneRecord
  }

  /*
        注文情報を登録する
    */
  static registOrderedItem(
    orderId,
    userId,
    itemId,
    itemName,
    unitPrice,
    quantity
  ) {
    consola.log(`registOrderedItem called!`)
    return new Promise(function(resolve, reject) {
      const app = APP_ID
      // Build record for kintone app
      const record = {
        order_id: {
          value: orderId
        },
        user_id: {
          value: userId
        },
        item_id: {
          value: itemId
        },
        item_name: {
          value: itemName
        },
        unit_price: {
          value: unitPrice
        },
        quantity: {
          value: quantity
        }
      }
      // Add to kintone
      const kintoneRecord = OrderedItem.auth()
      kintoneRecord
        .addRecord({ app, record })
        .then((rsp) => {
          consola.log(rsp)
          resolve()
        })
        .catch((err) => {
          consola.error(err)
          consola.error(`ERROR OBJECT: ${JSON.stringify(err.error)}`)
          reject(err)
        })
    })
  }
}
