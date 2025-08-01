import { initFS } from '..'

async function run() {
  const fs = await initFS()
  await fs.writeFile('/hello.txt', 'Hello World')
  const text = await fs.readFile('/hello.txt')
  console.log(text)
}

run()
