import { config } from '../../config/index.js'

export const initiateUpload = {
  method: 'POST',
  path: '/initiate',
  options: {
    // validate: {
    //   payload: // validate the payload for correct fields and types, what is optional? copy from CDP uploader?
    //   options: { abortEarly: false },
    //   failAction: async (request, h, err) => {
    //     return if payload is invalid return useful error message
    //   }
    // },
    handler: async (request, h) => {
      // split this into own function for sake of unit tests
      try {
        console.log('initiate route')
        const response = await fetch(`${config.get('uploaderUrl')}/initiate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(request.payload)
        })
        const json = await response.json()
        console.log('*****', json)
        return h.response(json).code(response.status)
      } catch (err) {
        console.log(err.cause)
        throw new Error(err)
      }
      // make fetch to CDP uploader
      // pass on valid payload
      // return response from uploader
      // if the response from CDP uploader is not 201 need to pass back the error and message
    }
  }
}
