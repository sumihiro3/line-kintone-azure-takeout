<template lang="pug">
  div.w-90
    b-card.mt-2.mb-4.justify-content-center(
      v-if="transactionInfo"
      border-variant="primary"
      :img-src="orderDeliveryStateImage"
      img-alt="Image"
      img-top
    )
      b-card-body.p-0
        b-card-title.mb-4
          | {{ orderDeliveryStateTitle }}
        b-card-text
          | {{ orderDeliveryStateMessage }}
          h1.display-1.text-center(v-if="transactionInfo.deliveryState === 'READY'")
            u
              | {{ transactionInfo.recordId }}
</template>

<script>
import consola from 'consola'
import getLineUserId from '~/utils/liff'

export default {
  components: {},
  validate({ params, query }) {
    // Show error page when order id not set
    consola.log('Params', params)
    consola.log('Query', query)
    consola.log('Query liff.state', query['liff.state'])
    let orderId = query.o
    if (!orderId && query['liff.state']) {
      orderId = query['liff.state'].slice(1)
    }
    consola.log('OrderID', orderId)
    return orderId
  },
  asyncData({ params, query }) {
    consola.log('Params', params)
    consola.log('Query', query)
    consola.log('Query liff.state', query['liff.state'])
    let orderId = query.o
    if (!orderId && query['liff.state']) {
      orderId = query['liff.state'].slice(1)
    }
    consola.log('OrderID', orderId)
    return {
      orderId
    }
  },
  data() {
    return {
      lineUserId: 'dummyUser',
      orderId: null,
      transactionInfo: null,
      orderDeliveryStateTitle: 'ご注文の商品は準備中です',
      orderDeliveryStateMessage: 'しばらくお待ち下さい',
      orderDeliveryStateImage:
        'https://1.bp.blogspot.com/-J6DhylEKdnA/WqihcAfcKWI/AAAAAAABKzk/d2002Ljcu6sKrB0H7RE5LRldWNjuPdTfwCLcBGAs/s300/cooking_chef_man_asia.png'
    }
  },
  async mounted() {
    this.$store.dispatch('progressCircleOn')
    const lineUserId = await getLineUserId()
    if (!lineUserId) {
      if (process.env.SKIP_LOGIN === 'true') {
        consola.warn('Skip LINE Login because of SKIP_LOGIN set.')
      } else {
        consola.log('Need to login!')
        // eslint-disable-next-line no-undef
        liff.login({
          redirectUri: `${process.env.API_URL}/?o=${this.orderId}`
        })
      }
    } else {
      this.lineUserId = lineUserId
    }
    if (this.orderId) {
      // Load Order info
      await this.getOrderTransactionInfo(this.orderId)
    }
    this.$store.dispatch('progressCircleOff')
  },
  methods: {
    getOrderIdFromParams(query) {
      consola.log('getOrderIdFromParams called!', query)
      consola.log('Query ', query['liff.state'])
      let orderId = query.o
      if (!orderId && query['liff.state']) {
        orderId = query['liff.state'].slice(1)
      }
      consola.log('OrderID', orderId)
      return orderId
    },
    async getOrderTransactionInfo(orderId) {
      consola.log('getOrderTransactionInfo called!', orderId)
      this.$store.dispatch('progressCircleOn')
      consola.log('orderId', orderId)
      const data = {
        userId: this.lineUserId,
        orderId
      }
      const result = await this.$axios.post(
        '/api/getOrderTransactionInfo',
        data
      )
      consola.log('API getOrderTransactionInfo result', result)
      this.transactionInfo = result.data.transactionInfo
      switch (this.transactionInfo.deliveryState) {
        case 'READY':
          this.orderDeliveryStateTitle = '商品の準備ができました'
          this.orderDeliveryStateMessage =
            '店舗窓口でスタッフにこのメッセージをお見せください'
          this.orderDeliveryStateImage =
            'https://2.bp.blogspot.com/-IcQD1H8lx5c/VnKNfpw47BI/AAAAAAAA2EY/iVffCXI9_ug/s400/food_zei3_takeout.png'
          break
        case 'DELIVERED':
          this.orderDeliveryStateTitle = '商品は受取済みです'
          this.orderDeliveryStateMessage = 'またのご来店をお待ちしています'
          this.orderDeliveryStateImage =
            'https://4.bp.blogspot.com/-2SmmpnBL180/WOOZTijHQyI/AAAAAAABDiQ/wjU5-4UKxMMNqLqnIS3GcBWVgAzSQTrMQCLcB/s400/reji_cashier_fastfood.png'
          break
      }

      this.$store.dispatch('progressCircleOff')
    }
  }
}
</script>
