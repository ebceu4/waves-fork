import { Database } from 'sqlite3'
import * as linq from "linq"
import * as guid from "uuid/v4"
import * as WavesAPI from 'waves-api'

const Waves = WavesAPI.create(WavesAPI.MAINNET_CONFIG)

function getAddress(pk: string) {
  return Waves.tools.getAddressFromPublicKey(pk)
}

var db = new Database('./data/db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS blocks (
    signature TEXT PRIMARY KEY,
    parent TEXT,
    height INTEGER)`)
  db.run(`CREATE TABLE IF NOT EXISTS full_blocks (
    signature TEXT PRIMARY KEY,
    timestamp INTEGER,
    baseTarget INTEGER,
    generator TEXT)`)
  db.run(`CREATE INDEX IF NOT EXISTS blockHeightIndex ON blocks(height)`)
});

export const BlockStorage = {
  put: ($signature: string, $parent: string, $height: number) => {
    db.serialize(() => {
      db.run(`INSERT OR IGNORE INTO blocks (signature, parent, height) VALUES ($signature, $parent, $height)`,
        {
          $signature,
          $parent,
          $height
        },
        function (err) {
          if (err) {
            console.log(err)
          }
          if (this.changes && this.changes > 0) {
            console.log(`NEW BLOCK -> ${$signature}, height: ${$height}, parent: ${$parent}`)
          }
        })
    })
  },

  putBlock: ($signature: string, $timestamp: number, $baseTarget: number, $generator: string) => {
    db.serialize(() => {
      db.run(`INSERT OR IGNORE INTO full_blocks (signature, timestamp, baseTarget, generator) VALUES ($signature, $timestamp, $baseTarget, $generator)`,
        {
          $signature,
          $timestamp,
          $baseTarget,
          $generator
        },
        function (err) {
          if (err) {
            console.log(err)
          }
          if (this.changes && this.changes > 0) {
            console.log(`BLOCK DETAILS -> ${$signature}, baseTarget: ${$baseTarget}, generator: ${$generator}`)
          }
        })
    })
  },

  addBranch: (height: number, length: number) => {
    db.serialize(() => {
      db.all(`SELECT * FROM blocks WHERE height = ${height}`, function (err, rows) {
        let row = rows[Math.floor(Math.random() * rows.length)]
        let parent = row.signature
        let h = height
        for (let i = 0; i < length; i++) {
          h++
          const id = `FAKE_BLOCK_${guid()}`
          BlockStorage.put(id, parent, h)
          parent = id
        }
      })
    })
  },

  getHeight: () => new Promise<number>((resolve, reject) => {
    db.serialize(() => {
      db.get(`SELECT MAX(height) as height FROM blocks`, function (err, row) {
        resolve(row.height)
      })
    })
  }),

  getSignatureToFill: () => new Promise<string>((resolve, reject) => {
    db.serialize(() => {
      db.all(
        `
select t1.signature, t3.height from (select t4.signature from blocks as t4 
except
select signature from full_blocks) as t1 join blocks as t3 on t1.signature = t3.signature order by t3.height desc limit 5
        `, function (err, rows) {
          let row = rows[Math.floor(Math.random() * rows.length)]
          if (row) {
            resolve(row.signature)
          }
          else {
            resolve(undefined)
          }
        })
    })
  }),

  getRecentBlocks: (count: number) => new Promise((resolve, _) => {
    db.serialize(() => {
      const blocksByHeight: { [i: number]: any } = {}
      const branches: any[] = []

      const branchForBlock = (signature: string, height: number) => {
        let branch = branches.find(b => b.blocks[signature] || b.parent == signature)
        if (!branch) {
          branch = { id: branches.length, blocks: {}, open: height }
          branches.push(branch)
        }

        return branch
      }

      const checkBranchesAndClose = (signature: number, height: number) => {
        linq.from(branches).where(b => b.parent == signature)
          .orderByDescending(b => Object.keys(b.blocks).length)
          .skip(1).forEach(b => b.closed = height)
      }

      const openBranchesCount = (height: number) => branches.filter(b => b.close ? b.close < height : true)
        .filter(b => b.open > height).filter(b => Object.keys(b.blocks).length > 1).length

      //    db.all(`select t1.signature, t1.parent, t1.height, t3.baseTarget, t3.timestamp, t3.generator from blocks as t1 left join full_blocks as t3 on t1.signature = t3.signature where height > (select max(height) from blocks) - ${count} and exists (select * from blocks as t2 where t2.parent == t1.signature limit 1) order by height desc`, function (err, rows) {
      db.all(`select t1.signature, t1.parent, t1.height, t3.baseTarget, t3.timestamp, t3.generator from blocks as t1 left join full_blocks as t3 on t1.signature = t3.signature where height > (select max(height) from blocks) - ${count} order by height desc`, function (err, rows) {
        rows.forEach(block => {
          if (!blocksByHeight[block.height]) {
            blocksByHeight[block.height] = {}
          }
          checkBranchesAndClose(block.signature, block.height)
          const branch = branchForBlock(block.signature, block.height)
          block.branch = branch.id
          branch.blocks[block.signature] = true
          branch.parent = block.parent
          if (block.generator) {
            block.generator = getAddress(block.generator)
          }
          blocksByHeight[block.height][block.signature] = block
        })

        //branches.forEach(b => b.blocks = Object.keys(b.blocks))
        const activeBranches = branches.filter(b => Object.keys(b.blocks).length > 1)

        for (let height in blocksByHeight) {
          const blocksAtHeight = blocksByHeight[height]
          blocksByHeight[height] = linq.from(Object.keys(blocksAtHeight))
            .where(id => activeBranches.find(b => b.blocks[id]))
            .orderByDescending(id => Object.keys(branchForBlock(id, -1).blocks).length)
            .select(id => blocksAtHeight[id]).toArray()
        }

        resolve(blocksByHeight)
      })
    })
  })
}