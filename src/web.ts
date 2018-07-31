import axios from 'axios'

const colors = [
  '#001f3f',
  '#0074D9',
  '#7FDBFF',
  '#39CCCC',
  '#3D9970',
  '#2ECC40',
  '#01FF70',
  '#FFDC00',
  '#FF851B',
  '#FF4136',
  '#85144b',
  '#F012BE',
  '#B10DC9',
]

function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: string, c: string) {
  ctx.beginPath()
  ctx.fillStyle = c
  ctx.arc(x, y, r, 0, 2 * Math.PI)
  ctx.fill()
  ctx.fillStyle = "black"
  ctx.fillText(t, x + r + 5, y + r / 2)
}

interface Block {
  signature: string,
  parent: string,
  timestamp: number,
  height: number,
  peers: string[]
}

interface Branch {
  position: number,
  lastBlock: Block,
  color: string
}

async function update() {
  const blocks: Block[] = await axios.get('http://localhost:3001/blocks').then(x => x.data)
  const canvas = document.getElementById('root') as HTMLCanvasElement
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight * 6
  const ctx = canvas.getContext('2d')

  const heightByBlock = 30
  const widthByBranch = 50
  const verticalPaddingTop = 50

  const centerX = canvas.clientWidth / 2

  const branches: Branch[] = []

  const getBranch = (block: Block): Branch => {

    let index = branches.findIndex(b => b.lastBlock.parent == block.signature)

    if (index == -1) {
      const branchesCount = Object.keys(branches).length
      const position = branchesCount % 2 != 0 ? (Math.floor(branchesCount / 2) + 1) : (-branchesCount / 2)
      const color = colors[branchesCount % colors.length]
      branches.push({ position, lastBlock: block, color })
      index = branches.length - 1
    }

    branches[index].lastBlock = block
    return branches[index]
  }

  blocks.forEach((block, i) => {
    const b = getBranch(block)
    drawBlock(ctx, centerX + b.position * widthByBranch, verticalPaddingTop + heightByBlock * i, 10, block.signature, b.color)
  })

  setTimeout(update, 1000)
}

update()
