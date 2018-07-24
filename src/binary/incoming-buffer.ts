import { Buffer } from "buffer";
import { IReadBuffer, read } from "./buffer";

export interface IncomingBuffer {
  tryGet(length: number): IReadBuffer
  write(buffer: Buffer): void
  length(): number
  getInt(offset?: number): number
  getByte(offset?: number): number
}

export const IncomingBuffer = (): IncomingBuffer => {
  let length = 0
  let buffers: Buffer[] = []

  const bufferOffsetAccess = <T>(offset: number, bytesSize: number, bufferAccess: (buffer: Buffer) => T) => {
    if (!offset) offset = 0

    if (offset > length - bytesSize)
      return
    if (buffers.length == 0)
      return

    if (buffers[0].byteLength >= offset + bytesSize) {
      return bufferAccess(buffers[0])
    }

    buffers = [Buffer.concat(buffers)]

    return bufferAccess(buffers[0])
  }

  return {
    write(buffer: Buffer) {
      buffers.push(buffer)
      length += buffer.byteLength
    },
    length() {
      return length
    },
    tryGet(len: number) {
      if (length < len)
        return
      if (buffers.length == 0)
        return

      const r = Buffer.concat(buffers)
      buffers = [r.slice(len, length)]
      length -= len

      return read(r.slice(0, len))
    },
    getInt(offset?: number) {
      if (!offset) offset = 0

      return bufferOffsetAccess(offset, 4, b => b.readInt32BE(offset))
    },
    getByte(offset?: number) {
      if (!offset) offset = 0

      return bufferOffsetAccess(offset, 1, b => b.readInt8(offset))
    }
  }
}