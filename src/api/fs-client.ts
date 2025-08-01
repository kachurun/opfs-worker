import { wrap, type Remote } from 'comlink'
// @ts-ignore - worker query import handled by bundler
import WorkerCtor from '../worker/fs.worker?worker&inline'
import type * as FSImpl from '../worker/fs-impl'

export type FS = Remote<typeof FSImpl>

export function initFS(): FS {
  const worker = new WorkerCtor()
  return wrap<typeof FSImpl>(worker) as FS
}
