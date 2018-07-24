import { array, int, string, byte, bytes, fixedBytes, fixedStringBase58, long, short, fixedString, fixedBytesWithSchema, shorts, shortSizedString } from './primitives'
import { createSchema, ISchema } from './ISchema'
import { EmptySchema } from './ISchema';
import * as Long from 'long';

export interface IpAddress {
  address: string,
  port: number
}

const IpAddressSchema = createSchema<IpAddress>({
  address: fixedBytes(4),
  port: int,
})

type Transactions = GenesisTransaction | PaymentTransaction | IssueTransaction | TransferTransaction | ReissueTransaction | BurnTransaction | ExchangeTransaction | LeaseTransaction | LeaseCancelTransaction | CreateAliasTransaction

export interface Transaction {
  size: number,
  type: number,
  body: Transactions
}

export interface AddressOrAlias {
  version: number
  address: string
}

const AddressOrAliasSchema = createSchema<AddressOrAlias>({
  version: byte,
  address: (x) => x.version == 1 ? fixedStringBase58(25) : createSchema<any>({
    scheme: byte,
    length: short,
    address: (y) => fixedString(y.length)
  })
})

export interface GenesisTransaction {
  timestamp: Long
  recipient: string
  amount: Long
}

export const GenesisTransactionSchema = createSchema({
  timestamp: long,
  recipient: fixedStringBase58(26),
  amount: long
})

export interface PaymentTransaction {
  timestamp: Long
  sender: string
  recipient: string
  amount: Long
  fee: Long
  signature: string
}

export const PaymentTransactionSchema = createSchema({
  timestamp: long,
  sender: fixedStringBase58(32),
  recipient: fixedStringBase58(26),
  amount: long,
  fee: long,
  signature: fixedStringBase58(64)
})

export interface TransferTransaction {
  signature: string,
  type: number,
  sender: string,
  amountIsAsset: number,
  assetId?: string,
  feeIsAsset: number,
  feeAssetId?: string,
  timestamp: Long,
  amount: Long
  fee: Long
  recipient: string,
  attachmentLength: number
  attachment: Uint8Array
}

const TransferTransactionSchema = createSchema<TransferTransaction>({
  signature: fixedStringBase58(64),
  type: byte,
  sender: fixedStringBase58(32),
  amountIsAsset: byte,
  assetId: (x) => x.amountIsAsset == 1 ? fixedBytes(32) : EmptySchema,
  feeIsAsset: byte,
  feeAssetId: (x) => x.feeIsAsset == 1 ? fixedBytes(32) : EmptySchema,
  timestamp: long,
  amount: long,
  fee: long,
  recipient: AddressOrAliasSchema,
  attachmentLength: short,
  attachment: (x) => fixedBytes(x.attachmentLength)
})

export interface IssueTransaction {
  signature: string,
  type: number,
  sender: string,
  name: number,
  description: string,
  quantity: Long,
  decimals: number,
  isReissuable: number,
  fee: Long,
  timestamp: Long
}

export const IssueTransactionSchema = createSchema<IssueTransaction>({
  signature: fixedStringBase58(64),
  type: byte,
  sender: fixedStringBase58(32),
  name: shortSizedString,
  description: shortSizedString,
  quantity: long,
  decimals: byte,
  isReissuable: byte,
  fee: long,
  timestamp: long
})

export interface ReissueTransaction {
  signature: string,
  type: number,
  sender: string,
  assetId: string,
  quantity: Long,
  isReissuable: number,
  fee: Long,
  timestamp: Long
}

export const ReissueTransactionSchema = createSchema<ReissueTransaction>({
  signature: fixedStringBase58(64),
  type: byte,
  sender: fixedStringBase58(32),
  assetId: fixedStringBase58(32),
  quantity: long,
  isReissuable: byte,
  fee: long,
  timestamp: long
})

export interface BurnTransaction {
  sender: string,
  assetId: string,
  amount: Long,
  fee: Long,
  timestamp: Long
  signature: string,
}

export const BurnTransactionSchema = createSchema<BurnTransaction>({
  sender: fixedStringBase58(32),
  assetId: fixedStringBase58(32),
  amount: long,
  fee: long,
  timestamp: long,
  signature: fixedStringBase58(64)
})

export interface Order {
  sender: string
  matcher: string
  amountIsAsset: number
  assetId?: string,
  priceIsAsset: number,
  priceAssetId: string
  orderType: number,
  price: Long,
  amount: Long,
  timestamp: Long,
  expiration: Long,
  matcherFee: Long,
  signature: string
}

export const OrderSchema = createSchema<Order>({
  sender: fixedStringBase58(32),
  matcher: fixedStringBase58(32),
  amountIsAsset: byte,
  assetId: (x) => x.amountIsAsset == 1 ? fixedBytes(32) : EmptySchema,
  priceIsAsset: byte,
  priceAssetId: (x) => x.priceIsAsset == 1 ? fixedBytes(32) : EmptySchema,
  orderType: byte,
  price: long,
  amount: long,
  timestamp: long,
  expiration: long,
  matcherFee: long,
  signature: fixedStringBase58(64)
})

export interface ExchangeTransaction {
  buyOrderSize: number,
  sellOrderSize: number,
  buyOrder: Order,
  sellOrder: Order,
  price: Long,
  amount: Long,
  buyMatcherFee: Long,
  sellMatcherFee: Long,
  fee: Long,
  timestamp: Long,
  signature: string
}

export const ExchangeTransactionSchema = createSchema<ExchangeTransaction>({
  buyOrderSize: int,
  sellOrderSize: int,
  buyOrder: OrderSchema,
  sellOrder: OrderSchema,
  price: long,
  amount: long,
  buyMatcherFee: long,
  sellMatcherFee: long,
  fee: long,
  timestamp: long,
  signature: fixedStringBase58(64)
})

export interface LeaseTransaction {
  sender: string,
  recipient: AddressOrAlias,
  amount: Long,
  fee: Long,
  timestamp: Long,
  signature: string
}

export const LeaseTransactionSchema = createSchema<LeaseTransaction>({
  sender: fixedStringBase58(32),
  recipient: AddressOrAliasSchema,
  amount: long,
  fee: long,
  timestamp: long,
  signature: fixedStringBase58(64)
})


export interface LeaseCancelTransaction {
  sender: string,
  fee: Long,
  timestamp: Long,
  leaseTransactionId: string
  signature: string
}

export const LeaseCancelTransactionSchema = createSchema<LeaseCancelTransaction>({
  sender: fixedStringBase58(32),
  fee: long,
  timestamp: long,
  leaseTransactionId: fixedStringBase58(32),
  signature: fixedStringBase58(64)
})

export interface CreateAliasTransaction {
  sender: string
  alias: string,
  fee: Long,
  timestamp: Long,
  signature: string
}

export const CreateAliasTransactionSchema = createSchema<CreateAliasTransaction>({
  sender: fixedStringBase58(32),
  alias: shortSizedString,
  fee: long,
  timestamp: long,
  signature: fixedStringBase58(64)
})


const transactionDiscriminator = (x: Transaction): ISchema<any> => {
  switch (x.type) {
    case 2:
      return PaymentTransactionSchema
    case 3:
      return IssueTransactionSchema
    case 4:
      return TransferTransactionSchema
    case 5:
      return ReissueTransactionSchema
    case 6:
      return BurnTransactionSchema
    case 7:
      return ExchangeTransactionSchema
    case 8:
      return LeaseTransactionSchema
    case 9:
      return LeaseCancelTransactionSchema
    case 10:
      return CreateAliasTransactionSchema
    default:
      return fixedBytes(x.size - 1)
  }
}

export const TransactionDiscriminatorSchema = createSchema<Transaction>({
  size: int,
  type: byte,
  body: transactionDiscriminator
})

export const TransactionDiscriminatorSchemaNoSize = createSchema<Transaction>({
  type: byte,
  body: transactionDiscriminator
})

export interface Block {
  version: number
  timestamp: Long
  parent: string
  consensusSize: number
  baseTarget: Long
  generationSignature: string
  transactionsBlockSize: number
  transactionsCount?: number
  transactions: Transaction[]
  generatorPublicKey: string
  features?: Uint16Array
  signature: string
}

export const BlockSchema = createSchema<Block>({
  version: byte,
  timestamp: long,
  parent: fixedStringBase58(64),
  consenusSize: int,
  baseTarget: long,
  generationSignature: fixedStringBase58(32),
  transactionsBlockSize: int,
  transactionsCount: (x) => x.version < 3 ? byte : int,
  transactions: (x) => fixedBytesWithSchema(x.transactionsBlockSize - (x.version < 3 ? 1 : 4), TransactionDiscriminatorSchema),
  features: (x) => x.version < 3 ? EmptySchema : shorts,
  generatorPublicKey: fixedStringBase58(32),
  signature: fixedStringBase58(64)
})

export interface Version {
  major: number,
  minor: number,
  patch: number
}

export const VersionSchema = createSchema<Version>({
  major: int,
  minor: int,
  patch: int,
})

export interface Handshake {
  appName: string
  version: Version
  nodeName: string
  nonce: Long
  declaredAddress: Uint8Array | number[]
  timestamp: Long
}

export const HandshakeSchema = createSchema<Handshake>({
  appName: string,
  version: VersionSchema,
  nodeName: string,
  nonce: long,
  declaredAddress: bytes,
  timestamp: long,
})

export enum MessageCode {
  GetPeers = 1,
  Peers = 2,
  GetSignatures = 20,
  Signatures = 21,
  GetBlock = 22,
  Block = 23,
  Transaction = 25,
}

export type SchemaTypes = IpAddress[] | string[] | Block | string | void | Transaction | {}

export function Schema(code: MessageCode, size: number): ISchema<SchemaTypes> {
  switch (code) {
    case MessageCode.GetPeers:
      return EmptySchema
    case MessageCode.Peers:
      return array(IpAddressSchema)
    case MessageCode.GetSignatures:
      return array(fixedStringBase58(64))
    case MessageCode.Signatures:
      return array(fixedStringBase58(64))
    case MessageCode.GetBlock:
      return fixedStringBase58(64)
    case MessageCode.Block:
      return BlockSchema
    case MessageCode.Transaction:
      return TransactionDiscriminatorSchemaNoSize
    default:
      return EmptySchema
  }
}