const consola = require('consola')
const kintone = require('@kintone/kintone-js-sdk')

const DOMAIN_NAME = process.env.KINTONE_DOMAIN_NAME
const KINTONE_USER_ID = process.env.KINTONE_USER_ID
const KINTONE_USER_PASSWORD = process.env.KINTONE_USER_PASSWORD
const APP_ID = process.env.KINTONE_INQUIRY_APP_ID

/*
    問い合わせ情報
    - user_id
    - language
    - message
    - category
    - translation
    - reply_message
    - replied_at
    - order_id
    - message_at
*/
module.exports = class ContactMessage {
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
    consola.log(kintoneAuth)
    const kintoneConnection = new kintone.Connection({
      domain: DOMAIN_NAME,
      auth: kintoneAuth
    })
    const kintoneRecord = new kintone.Record({ connection: kintoneConnection })
    return kintoneRecord
  }

  /*
        問い合わせ情報を登録する
    */
  static registContactInfo(userId, message, category, translation, orderId) {
    consola.log(`registContactInfo called!`)
    return new Promise(function(resolve, reject) {
      const app = APP_ID
      // Build record for kintone app
      const record = {
        user_id: {
          value: userId
        },
        message: {
          value: message
        },
        category: {
          value: category
        },
        translation: {
          value: translation
        },
        order_id: {
          value: orderId
        }
      }
      // Add to kintone
      const kintoneRecord = ContactMessage.auth()
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
