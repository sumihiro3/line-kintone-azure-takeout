import consola from 'consola'

export default function({ $axios, redirect }) {
  $axios.onRequest((config) => {
    config.headers.common['Access-Control-Allow-Origin'] = '*'
    config.headers.common['Content-Type'] = 'application/json'
    config.headers.common['X-Requested-With'] = 'XMLHttpRequest'
  })
  $axios.onError((error) => {
    consola.warn('Error', error)
    if (error.response && error.response.status === 500) {
      redirect('/sorry')
    }
  })
}
