export interface Stats {
  isFile(): boolean
  isDirectory(): boolean
  size: number
  mtime: Date
}

declare module '*?worker&inline' {
  const workerConstructor: { new (): Worker }
  export default workerConstructor
}

declare module '*?worker' {
  const workerConstructor: { new (): Worker }
  export default workerConstructor
}
