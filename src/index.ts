import { NodeConnection } from "./transport/connection";
import { config } from "./config-main";
import * as Express from 'express'

import { MongoClient } from 'mongodb'

interface Peer {
  _id: string
  peer: string
  port: number
  lastPeerSync?: number
  lastConnected?: number
  connectionsCount: number
  peerSyncCount: number
  checkpoints?: string[]
}

interface Block {
  _id: string
  signature: string
  parent: string
  peers: string[]
  timestamp: number
  height: number
}

interface Config {
  rootBlock: Block
  networkPrefix: string
  port: number
  mongoUri: string
  initialPeers: string[]
}

interface Db {
  getRandomPeer(): Promise<Peer>,
  getPeer(peerId: string): Promise<Peer>,
  getPeers(): Promise<Peer[]>,
  updatePeer(peer: Partial<Peer>, $inc?: Partial<Peer>, addCheckpoint?: string): Promise<{}>
  rollbackPeer(peerId: string): Promise<void>
  updatePeers(peers: Partial<Peer>[]): Promise<{}>
  updateBlock(signature: string, parent: string, peer: string, timestamp: number): Promise<void>
  getLastSignature(peer: string): Promise<string>
  getLastBlockForPeer(peer: string): Promise<Block | undefined>
  getBlocksFromEnd(limit: number): Promise<Block[]>
  processQueue(): Promise<void>
  enqueue(signature: string, parent: string, peer: string, timestamp: number): Promise<void>
}

// async function processBlocks(queue: any[], db: MongoClient) {
//   const blocks = db.db('fork').collection<Block>('blocks')

//   if (queue.length == 0) return

//   const { signature, parent, timestamp, peer, resolve } = queue.shift()

//   const lastBlock = _.getLastBlockForPeer(peer)

//   if (lastBlock && lastBlock.parent == parent && lastBlock.timestamp < timestamp) {
//     console.log('Pushing block with id: ' + parent)
//     await blocks.update(
//       { "_id": lastBlock._id },
//       { $pull: { peers: peer } },
//     )
//     await blocks.remove({ peers: { $size: 0 } }, { single: true })
//   }
// }

async function Db(config: Config): Promise<Db> {

  const db = (await MongoClient.connect(config.mongoUri))
  const peers = db.db('fork').collection<Peer>('peers')
  const blocks = db.db('fork').collection<Block>('blocks')
  await blocks.createIndex('timestamp')
  await blocks.createIndex('height')

  const blocksQueue = []

  const processQueue = async () => {
    if (processingQueue)
      return

    if (blocksQueue.length == 0)
      return

    processingQueue = true

    const { signature, parent, timestamp, peer, resolve } = blocksQueue.shift()

    const lastBlock = await _.getLastBlockForPeer(peer)
    if (lastBlock && lastBlock.parent == parent && lastBlock.timestamp < timestamp) {
      console.log('Pushing block with id: ' + parent)
      await blocks.update(
        { "_id": lastBlock._id },
        { $pull: { peers: peer } },
      )
      await blocks.remove({ peers: { $size: 0 } }, { single: true })
    }


    resolve()

    processingQueue = false

  }

  const enqueue = (signature, parent, peer, timestamp) => {
    return new Promise<void>(async (resolve, _) => {
      const blockFromDB = (await blocks.find({}).toArray()).filter(x => x._id == parent)[0]
      const parentBlock = blockFromDB || config.rootBlock
      const height = signature == config.rootBlock.signature ? config.rootBlock.height : parentBlock.height + 1
      await blocks.update(
        { "_id": signature },
        { $set: { signature, parent, timestamp, height } },
        { upsert: true }
      )
      await blocks.update(
        { "_id": signature },
        { $addToSet: { peers: peer } },
        { upsert: true }
      )
      blocksQueue.push({ signature, parent, peer, timestamp, resolve })
      processQueue()
    })
  }
  let processingQueue = false


  const _: Db = {
    enqueue,

    getRandomPeer: async () => {
      const query = peers.aggregate(
        [{ $sample: { size: 1 } }]
      )
      return (await query.toArray())[0]
    },

    processQueue,

    getBlocksFromEnd: async (limit: number) =>
      await blocks.find({}).sort({ 'height': -1 }).limit(limit).toArray(),

    getLastBlockForPeer: async (peer: string) =>
      (await blocks.find({ 'peers': peer }).sort({ 'timestamp': -1 }).limit(1).toArray())[0] || config.rootBlock,

    updatePeer: async (peer: Partial<Peer>, $inc?: Partial<Peer>, addCheckpoint?: string) => {

      if (!peer._id)
        return {}

      const p = { ...peer };
      delete p._id

      if (Object.keys(p).length > 0)
        await peers.update(
          { "_id": peer._id },
          {
            $set: p,
          },
          { upsert: true }
        ).catch(e => console.log(e)).then(x => x)

      if ($inc)
        await peers.update(
          { "_id": peer._id },
          {
            $inc
          },
          { upsert: true }
        ).catch(e => console.log(e)).then(x => x)

      if (addCheckpoint) {
        await peers.update(
          { "_id": peer._id },
          {
            $addToSet: { checkpoints: addCheckpoint },
          },
          { upsert: true },
        )

        await peers.update(
          { "_id": peer._id },
          { $push: { "checkpoints": { "$each": [], "$slice": -10 } } }
        )
      }
    },

    updatePeers: async (peers: Partial<Peer>[]) =>
      Promise.all(peers.map(p => _.updatePeer(p))),

    getPeers: async () =>
      peers.find().toArray(),

    getPeer: async (peerId: string) =>
      peers.findOne({ _id: peerId }),

    updateBlock: async (signature: string, parent: string, peer: string, timestamp: number) => {
      return enqueue(signature, parent, peer, timestamp)
    },

    getLastSignature: async (peer: string) => {
      let checkpoints = (await peers.findOne({ _id: peer })).checkpoints
      if (!checkpoints || checkpoints.length == 0) {
        checkpoints = [config.rootBlock.signature]
      }

      return checkpoints[checkpoints.length - 1]
    },

    rollbackPeer: async (peerId: string) => {
      await peers.update(
        { "_id": peerId, 'checkpoints.1': { "$exists": 1 } },
        { $pop: { checkpoints: 1 } }
      ).catch(e => console.log(e))
    }
  }
  const count = (await peers.count())
  if (count == 0)
    await Promise.all(config.initialPeers.map((p: string) => {
      return _.updatePeer({ _id: p, peer: p, port: config.port })
    }))

  return _
}

interface PeerConnection {
  peer: Peer
  isAlive: () => boolean
  stop: () => void
}

function PeerConnection(db: Db, peer: Peer, config: Config): PeerConnection {
  let stop = false
  let connection: NodeConnection
  let isAlive = false

  const getConnection = async () => {
    if (connection) {
      return connection
    }

    connection = NodeConnection(peer._id, config.port, config.networkPrefix)

    try {
      await connection.connectAndHandshake()
      await db.updatePeer({ _id: peer._id }, { connectionsCount: +1 })
      isAlive = true
      return connection
    } catch (error) {
    }
  }

  const peersUpdatePeriod = 10 * 1000

  const loop = async () => {
    try {
      const p = (await db.getPeer(peer._id))
      const readyForPeerUpdate = !p.lastPeerSync || Date.now() - p.lastPeerSync > peersUpdatePeriod
      if (readyForPeerUpdate) {
        const peers = (await (await getConnection()).getPeers())
        await db.updatePeer({ _id: peer._id, lastPeerSync: Date.now() }, { peerSyncCount: +1 })
        await db.updatePeers(peers.map(p => {
          const t = p.split(':')
          return { _id: t[0], peer: t[0], port: parseInt(t[1]) }
        }).filter(x => x._id != null && x._id != ''))
      }

      const readyForSignatures = true

      if (readyForSignatures) {
        const lastSig = await db.getLastSignature(peer._id);
        try {
          const sigs = [lastSig, ...(await (await getConnection()).getSignatures(lastSig)).filter(x => x != lastSig)]
          const time = Date.now()
          for (let i = 1; i < sigs.length; i++) {
            const s = sigs[i];
            await db.updateBlock(s, sigs[i - 1], peer._id, time + i)
          }
          if (sigs.length > 50) {
            await db.updatePeer({ _id: peer._id }, null, sigs[30])
          }
        } catch (error) {
          if (error == 'timeout') {
            db.rollbackPeer(peer._id)
          }
          else {
            throw error
          }
        }
      }

    } catch (error) {
      connection = null
      isAlive = false
    }

    schedule()
  }

  const schedule = () => {
    if (!stop)
      setTimeout(loop, 1000)
  }

  schedule()

  return {
    peer,
    isAlive: () => isAlive,
    stop: () => {
      stop = true
    }
  }
}

async function main() {
  const db = await Db(config)
  const connections: { [peer: string]: PeerConnection } = {}

  const checkAndCreate = async () => {
    const peers = await db.getPeers()
    peers.forEach(p => {
      if (!connections[p._id])
        connections[p._id] = PeerConnection(db, p, config)
    })

    console.log('Alive connections: ' + Object.keys(connections).filter(x => connections[x].isAlive()).length)

    schedule()
  }

  const schedule = () => {
    setTimeout(checkAndCreate, 5000)
    setTimeout(db.processQueue, 500)
  }

  schedule()

  // db.enqueue("2riVh5fXhg8yw5fg7zj87ZPyPYQ4SxumjW2Z5io3W3vCxtZR4Dgd59efmYUJvahR56cwNra7qywkDLTg6fscCyLu", "5rGFj4FC72inktB5QtnQYJrU19tJ139P9XoCSmpJrSAFCnuhb5LpsdB127PPcSZXxJgTamkzLeE7NuNNd4DuzGzU", "127.0.0.1", 1533028924752)

  // setTimeout(() => { db.enqueue("hello", "2riVh5fXhg8yw5fg7zj87ZPyPYQ4SxumjW2Z5io3W3vCxtZR4Dgd59efmYUJvahR56cwNra7qywkDLTg6fscCyLu", "127.0.0.1", 1533028924992) },5000)

  var app = Express()

  app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  app.get('/blocks', async function (req, res) {
    res.setHeader('Content-Type', 'application/json')
    const blocks = await db.getBlocksFromEnd(100)
    res.send(JSON.stringify(blocks))
  })

  app.use(Express.static('web'))
  app.listen(config.webPort)
}

main()

// async function test() {
//   const db = await Db(config)
//   const block = await db.getLastBlockForPeer('35.156.19.4')

//   console.log(block)
// }

// test()