import * as Main from './config-main'
import * as Test from './config-test'

export const cfg = (type: string) =>
  (type == 'main' ? Main : Test).config
