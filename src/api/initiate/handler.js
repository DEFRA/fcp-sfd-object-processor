import { config } from '../../config/index.js'

export const initiateHandler = async (payload) => {
  const response = await fetch(`${config.get('uploaderUrl')}/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
    // should we set the callback url here so it always goes to the object processor?
  })

  return {
    body: await response.json(),
    status: response.status
  }
}
