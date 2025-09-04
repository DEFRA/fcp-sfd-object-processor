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
      // config.get('cdpUploader.endpoint'
      try {
        console.log('initiate route')
        const response = await fetch('http://cdp-uploader:7337/initiate', {
          method: 'POST',
          headers: {
            'Content-type': 'application/json'
          },
          body: JSON.stringify(request.payload)
        })
        console.log('*****', response)
        return response.body
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
