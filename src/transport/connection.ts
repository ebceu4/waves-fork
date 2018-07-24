import * as LRU from "lru-cache";
import * as Long from "long";
import * as net from "net";
import { HandshakeSchema, MessageCode, Handshake, Block } from "./schema/messages";
import { serializeMessage, deserializeMessage } from "./schema/serialization";
import { write, IReadBuffer } from "../binary/buffer";
import { IncomingBuffer } from "../binary/incoming-buffer";

export interface NodeConnection {
  ip: () => string,

  close: () => any,
  connectAndHandshake: () => Promise<Handshake>,
  getPeers: () => Promise<string[]>,
  getSignatures: (lastSignature: string) => Promise<string[]>,
  getBlock: (signature: string) => Promise<Block>
  onMessage: (handler: (buffer: IReadBuffer) => void) => void

  onClose: (handler: () => any) => any
}

interface ICompletablePromise<T> {
  onComplete: (result: T) => void,
  onError: (error: any) => void,
  startOrReturnExisting: (func: any, timeout?: number) => Promise<T>
}

const CompletablePromise = function <T>(): ICompletablePromise<T> {
  var onComplete: any
  var onError: any

  const newPromise = () => new Promise<T>((resolve, reject) => {
    onComplete = resolve
    onError = reject
  })

  var promise = newPromise()
  var isExecuted = false;
  var isFinished = false;
  return {
    onComplete: result => { if (!isFinished) { isFinished = true; isExecuted = false; onComplete(result) } },
    onError: error => { if (!isFinished) { isFinished = true; isExecuted = false; onError(error) } },
    startOrReturnExisting: (func, timeout?) => {
      timeout = 10000
      if (!isExecuted) {
        isExecuted = true
        isFinished = false
        promise = newPromise()
        if (timeout) {
          const p = promise
          setTimeout(() => {
            if (promise == p)
              onError("timeout")
          }, timeout)
        }
        try {
          func()
        }
        catch (ex) {
          onError(ex)
        }
      } return promise
    }
  }
}

export const NodeConnection = (ip: string, port: number, networkPrefix: string): NodeConnection => {
  var handshakeWasReceived = false;
  const declaredAddress: any[] = []
  
  const handshake = {
    appName: 'waves' + networkPrefix,
    version: { major: 0, minor: 13, patch: 1 },
    nodeName: 'name',
    nonce: Long.fromInt(0),
    declaredAddress,
    timestamp: Long.fromNumber(new Date().getTime())
  }

  function tryToHandleHandshake(buffer: IncomingBuffer) {
    if (buffer.length() < 34)
      return

    const appNameLen = buffer.getByte(0)
    if (appNameLen <= 0) return
    const nodeNameLen = buffer.getByte(13 + appNameLen)
    if (nodeNameLen < 0) return
    const declaredAddressLen = buffer.getInt(22 + nodeNameLen + appNameLen)
    const totalHandshakeLen = 34 + appNameLen + nodeNameLen + declaredAddressLen

    const handshakeBuffer = buffer.tryGet(totalHandshakeLen)

    if (!handshakeBuffer)
      return

    try {
      var handshake = HandshakeSchema.decode(handshakeBuffer)
      return handshake
    }
    catch (ex) {
      return
    }
  }

  function tryToFetchMessage(buffer: IncomingBuffer): IReadBuffer {
    const available = buffer.length();
    if (available < 4)
      return

    var size = buffer.getInt()
    if (size > available)
      return

    var messageBuffer = buffer.tryGet(size + 4)
    return messageBuffer
  }

  function messageHandler(buffer: IReadBuffer) {
    const response = deserializeMessage(buffer)
    if (response) {
      if (response.code == MessageCode.Signatures) {
        const p = getPromise(MessageCode.GetSignatures, { lastSignature: response.content[0] }, false)
        if (p)
          p.onComplete(response.content)
      } else if (response.code == MessageCode.Peers) {
        const r = response.content.map((x: any) => x.address.join('.') + ':' + x.port)
        getPromise(MessageCode.GetPeers, {}).onComplete(r)
      } else if (response.code == MessageCode.Block) {
        const p = getPromise<Block>(MessageCode.GetBlock, { signature: response.content.signature }, false)
        if (p)
          p.onComplete(response.content)
        if (onMessageHandler) {
          onMessageHandler(buffer.slice())
        }
      }
      else {
        //console.log(`Unsupported message type: ${response.code}`)
        //console.log(response.content)
      }
    }
  }

  const client = new net.Socket()
  const connectAndHandshakePromise = CompletablePromise<Handshake>()
  const incomingBuffer = IncomingBuffer()
  const promises = LRU(100)
  var onCloseHandler: any
  var onMessageHandler: any

  const getPromise = <T>(code: MessageCode, params: any, createIfNotExists = true): ICompletablePromise<T> => {
    const key = `${code}_${Object.keys(params).map(p => p + '_' + params[p].toString()).join('$')}`
    let promise = promises.get(key)
    if (!promise) {
      if (!createIfNotExists)
        return
      promise = CompletablePromise()
      promises.set(key, promise)
    }
    return promise as ICompletablePromise<T>
  }
  client.on('data', function (data) {
    incomingBuffer.write(data)

    const handshakeResponse = tryToHandleHandshake(incomingBuffer)
    if (!handshakeWasReceived && handshakeResponse) {
      handshakeWasReceived = true
      connectAndHandshakePromise.onComplete(handshakeResponse)
    }

    if (handshakeWasReceived) {
      do {
        var messageBuffer = tryToFetchMessage(incomingBuffer)
        if (messageBuffer)
          messageHandler(messageBuffer)
      } while (messageBuffer)
    }
  })

  client.on('error', err => {
    //console.log('Error occured');
    //console.log(err)
    connectAndHandshakePromise.onError(err)
  })

  client.on('close', function () {
    connectAndHandshakePromise.onError('Connection closed')
    if (ip == "52.52.46.76") {
      console.log('Connection closed');
    }
    if (onCloseHandler)
      onCloseHandler()
  })

  return {
    ip: () => ip,

    connectAndHandshake: () => {
      return connectAndHandshakePromise.startOrReturnExisting(() => {
        client.connect(port, ip, () => {
          //console.log("connected")
          const buffer = write()
          HandshakeSchema.encode(buffer, handshake)
          client.write(buffer.raw())
        })
      })
    },

    close: () => {
      client.destroy()
    },

    onClose: handler => {
      onCloseHandler = handler
    },

    onMessage: handler => {
      onMessageHandler = handler
    },

    getPeers: () =>
      getPromise<string[]>(MessageCode.GetPeers, {}).startOrReturnExisting(() => {
        const m = serializeMessage({}, MessageCode.GetPeers)
        client.write(m)
      }),

    getSignatures: (lastSignature: string) =>
      getPromise<string[]>(MessageCode.GetSignatures, { lastSignature }).startOrReturnExisting(() => {
        client.write(serializeMessage([lastSignature], MessageCode.GetSignatures))
      }),

    getBlock: (signature: string) =>
      getPromise<Block>(MessageCode.GetBlock, { signature }).startOrReturnExisting(() => {
        client.write(serializeMessage(signature, MessageCode.GetBlock))
      })
  }
}