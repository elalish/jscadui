let seq = 1
let reqMap = new Map()
const RESPONSE = '__RESPONSE__'
const TRANSFERABLE = '__transferable'

export const withTransferable = (params,trans)=>{
  params[TRANSFERABLE] = trans
  return params
}

const messageHandler = (handlers, sendResponse, sendError) => {
  return async (e) => {
    const { method, params, id, error } = e.data
    if (id && method === RESPONSE) {
      const p = reqMap.get(id)

      if (!p) return console.error(`req ${id} not found`)
      reqMap.delete(id)

      if (error) p[1](error)
      else p[0](params)

      return
    }

    const fn = handlers[method]
    if (!fn) {
      const msg = 'no handler for type: ' + method
      console.error(msg, e)
      throw new Error(msg)
    }
    try {
      const out = await fn(params)
      if (id) {
        sendResponse(out, id)
      }
    } catch (error) {
      console.error(`error executing command ${method}`, params, error)
      sendError(error, id)
    }
  }
}

const fixTransfer = trans => (trans ? trans.map(a => a.buffer || a) : [])

const messageSender = _self => {
  const sendResponse = (params, id) => {
    let trans = params?.[TRANSFERABLE]
    if (trans) {
      delete params[TRANSFERABLE]
    }
    try {
      _self.postMessage({ method: RESPONSE, params, id }, fixTransfer(trans))
      
    } catch (error) {
      console.error('failed to send ', params, trans)
      throw error
    }
  }

  const sendError = (error, id) => {
    try {
      _self.postMessage({ method: RESPONSE, error, id })
    } catch (error) {
      console.error('failed to send ', error)
      throw error
    }
  }
  const sendNotify = (method, params = {}, trans = []) => {
    _self.postMessage({ method, params }, fixTransfer(trans))
  }

  const sendCmd = (method, params = {}, trans = [], timeout) => {
    const id = seq++
    _self.postMessage({ method, params, id }, fixTransfer(trans))

    const out = new Promise((resolve, reject) => {
      reqMap.set(id, [resolve, reject])
      if (timeout) {
        setTimeout(() => {
          reject('timeout')
        }, timeout)
      }
    })
    return out
  }

  return { sendCmd, sendNotify, sendResponse, sendError }
}

/**
 *
 * @param {*} _self reference to self of the main widnow (self) or reference to a worker
 * @param {*} handlers - object where key if method name, and value ih handler
 * @returns
 */
export const initMessaging = (_self, handlers) => {
  // service worker has the postMessage on the .controller, it is not na same object as addEventListener
  const out = messageSender(_self.postMessage ? _self : _self.controller)
  out.listener = messageHandler(handlers, out.sendResponse, out.sendError)
  out.self = _self
  _self.addEventListener?.('message', out.listener)

  return out
}
