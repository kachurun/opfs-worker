import type { Stats } from '../types/fs'

const root: FileSystemDirectoryHandle = await (navigator as any).storage.getDirectory()

function split(path: string): string[] {
  return path.split('/').filter(Boolean)
}

async function getDir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
  const parts = split(path)
  let dir: FileSystemDirectoryHandle = root
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part, { create })
  }
  return dir
}

async function getFile(path: string, create = false): Promise<FileSystemFileHandle> {
  const parts = split(path)
  const name = parts.pop()
  const dir = await getDir(parts.join('/'), create)
  return dir.getFileHandle(name || '', { create })
}

function join(...parts: string[]): string {
  const path = parts.join('/')
  return '/' + split(path).join('/')
}

export async function readFile(
  path: string,
  options?: { encoding?: string }
): Promise<string | Uint8Array> {
  const fh = await getFile(path)
  const file: any = await (fh as any).getFile()
  const buf = new Uint8Array(await file.arrayBuffer())
  const enc = options?.encoding ?? 'utf-8'
  if (enc === 'binary' || enc === 'buffer') return buf
  return new TextDecoder(enc).decode(buf)
}

export async function writeFile(
  path: string,
  data: string | Uint8Array,
  options?: { encoding?: string }
): Promise<void> {
  const fh = await getFile(path, true)
  const handle = await (fh as any).createSyncAccessHandle()
  const buffer =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)
  handle.truncate(0)
  handle.write(buffer, { at: 0 })
  handle.flush()
  handle.close()
}

export async function appendFile(
  path: string,
  data: string | Uint8Array,
  options?: { encoding?: string }
): Promise<void> {
  const fh = await getFile(path, true)
  const handle = await (fh as any).createSyncAccessHandle()
  const buffer =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : new Uint8Array(data)
  const size = handle.getSize()
  handle.write(buffer, { at: size })
  handle.flush()
  handle.close()
}

export async function unlink(path: string): Promise<void> {
  const parts = split(path)
  const name = parts.pop()
  const dir = await getDir(parts.join('/'))
  await dir.removeEntry(name || '')
}

export async function mkdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  if (options?.recursive) {
    await getDir(path, true)
    return
  }
  const parts = split(path)
  const name = parts.pop()
  const dir = await getDir(parts.join('/'))
  await dir.getDirectoryHandle(name || '', { create: true })
}

export async function rmdir(
  path: string,
  options?: { recursive?: boolean }
): Promise<void> {
  const parts = split(path)
  const name = parts.pop()
  const dir = await getDir(parts.join('/'))
  await dir.removeEntry(name || '', { recursive: options?.recursive })
}

export async function readdir(path: string): Promise<string[]> {
  const dir = await getDir(path)
  const out: string[] = []
  for await (const [name] of (dir as any).entries()) {
    out.push(name)
  }
  return out
}

export async function stat(path: string): Promise<Stats> {
  try {
    const fh = await getFile(path)
    const file: any = await (fh as any).getFile()
    return {
      isFile: () => true,
      isDirectory: () => false,
      size: file.size,
      mtime: file.lastModified ? new Date(file.lastModified) : new Date()
    }
  } catch {
    await getDir(path)
    return {
      isFile: () => false,
      isDirectory: () => true,
      size: 0,
      mtime: new Date()
    }
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src)
  for (const name of entries) {
    const srcPath = join(src, name)
    const destPath = join(dest, name)
    const s = await stat(srcPath)
    if (s.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      const content = await readFile(srcPath, { encoding: 'binary' })
      await writeFile(destPath, content as Uint8Array)
    }
  }
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  const s = await stat(oldPath)
  if (s.isDirectory()) {
    await copyDir(oldPath, newPath)
    await rmdir(oldPath, { recursive: true })
  } else {
    const data = await readFile(oldPath, { encoding: 'binary' })
    await writeFile(newPath, data as Uint8Array)
    await unlink(oldPath)
  }
}

export async function uploadFiles(
  files: File[] | FileList,
  targetDir: string
): Promise<void> {
  const list: any[] = Array.from(files as any)
  for (const file of list) {
    const rel = (file as any).webkitRelativePath || (file as any).name
    const path = join(targetDir, rel)
    const buffer = new Uint8Array(await (file as any).arrayBuffer())
    await writeFile(path, buffer)
  }
}
