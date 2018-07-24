import * as blake2b from "blake2b";
import { ISchema } from './ISchema';
import { Buffer } from 'buffer';
import { MessageCode, Schema, SchemaTypes } from './messages';
import { write, IReadBuffer } from '../../binary/buffer';

export function checksum(bytes: Buffer): number {
  var hash = blake2b(32)
  hash.update(bytes)
  var output = new Buffer(32)
  hash.digest(output)
  return output.readInt32BE(0)
}

export function serializeMessage<T extends SchemaTypes>(obj: T, code: MessageCode) {
  const schema = Schema(code, 0) as ISchema<T>
  const buffer = write()
  buffer.writeZeros(4 + 4 + 1 + 4 + 4)
  const beforePayload = buffer.position()
  schema.encode(buffer, obj)
  const afterPayload = buffer.position()
  const payloadLength = afterPayload - beforePayload
  const offset = payloadLength == 0 ? 4 : 0
  buffer.goTo(offset + 4)
  buffer.writeInt(305419896)
  buffer.writeByte(code)
  buffer.writeInt(payloadLength)
  if (payloadLength > 0) {
    const payload = buffer.raw(beforePayload, afterPayload)
    buffer.writeInt(checksum(payload))
  }
  buffer.goTo(offset)
  buffer.writeInt(buffer.length() - offset - 4)

  return buffer.raw(offset)
}

export function deserializeMessage(buffer: IReadBuffer): { code: MessageCode, content: any } {
  var length = buffer.readInt()
  var magic = buffer.readInt()
  var code = buffer.readByte() as MessageCode

  var payloadLength = buffer.readInt()
  if (payloadLength > 0) {
    var payloadChecksum = buffer.readInt()
    //var payload = buffer.slice(buffer.index, buffer.index + payloadLength)
    //var computedChecksum = checksum(payload.raw)
    //if (payloadChecksum != computedChecksum)
    //  throw "Invalid checksum"
  }

  const schema = Schema(code, payloadLength)
  const content = schema.decode(buffer)
  return { code, content }
}
