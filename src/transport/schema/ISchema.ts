import { IReadBuffer, IWriteBuffer } from '../../binary/buffer';
import { IDictionary } from '../../generic/dictionary';
import { SchemaTypes } from './messages';

export interface ISchema<T> {
  [i: string]: any
  encode(buffer: IWriteBuffer, obj: T): void
  decode(buffer: IReadBuffer): T
}

export interface IMessageSchema<T> extends ISchema<T> {
  contentId: number
}

export const EmptySchema: ISchema<void> = { encode: (b, o) => { }, decode: b => { } }

export const LoggingSchema = <T>(original: ISchema<T>): ISchema<T> => ({
  encode: (b, o) => {
    original.encode(b, o)
  }, decode: b => {
    const r = original.decode(b)
    return r
  }
})

export const FallbackSchema: ISchema<Uint8Array> = { encode: (b, o) => { }, decode: b => { return b.readBytes(b.length() - b.position()) } }

export const LeaveBytesFromEnd = (size: number): ISchema<void> => { return { encode: (b, o) => { }, decode: b => { b.goToEnd(); b.goTo(-size) } } }

export type SchemaFactory<Self, T> = ((self: Self) => ISchema<T>)

export function createSchema<T extends SchemaTypes>(namedSchemas: IDictionary<ISchema<any> | SchemaFactory<T, any>>): ISchema<T> {
  const keys = Object.keys(namedSchemas)
  return {
    encode: (buffer: IWriteBuffer, obj: any) => {
      keys.forEach(k => {
        let schema = namedSchemas[k]
        if (typeof schema === 'function')
          schema = (schema as SchemaFactory<T, any>)(obj) as ISchema<any>
        //console.log(`encoding: ${k} = ${obj[k]}`)
        schema.encode(buffer, obj[k])
      })
    },
    decode: (buffer: IReadBuffer) => {
      const obj: any = {}
      keys.forEach(k => {
        let schema = namedSchemas[k]
        if (typeof schema === 'function')
          schema = (schema as SchemaFactory<T, any>)(obj as T) as ISchema<any>
        obj[k] = schema.decode(buffer)
      })
      return obj as T
    }
  }
}

export function createMessageSchema<T>(contentId: number, namedSchemas: IDictionary<ISchema<any>>): IMessageSchema<T> {
  const schema = createSchema(namedSchemas)
  schema['contentId'] = contentId
  const r = schema as IMessageSchema<T>
  return r
}
