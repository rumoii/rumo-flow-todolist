import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const yaml = createRequire(require.resolve('electron-updater'))('js-yaml')

export function checkUpdateRelease(directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('正式更新包必须使用正式版本号，不接受 RC 或预览版')
  const metadata = yaml.load(fs.readFileSync(path.join(directory, 'latest.yml'), 'utf8'))
  const name = `rumo-flow-todolist-${version}-x64.exe`
  if (metadata?.version !== version || metadata.path !== name || metadata.files?.length !== 1 || metadata.files[0].url !== name) throw new Error('latest.yml 版本、文件名或架构与本次构建不一致')
  const installer = fs.readFileSync(path.join(directory, name))
  const sha512 = crypto.createHash('sha512').update(installer).digest('base64')
  const sha256 = crypto.createHash('sha256').update(installer).digest('hex')
  if (!installer.length || metadata.files[0].size !== installer.length || metadata.files[0].sha512 !== sha512 || metadata.sha512 !== sha512) throw new Error('安装包大小或 SHA-512 与 latest.yml 不一致')
  const checksum = fs.readFileSync(path.join(directory, `${name}.sha256`), 'utf8').trim()
  if (checksum !== `${sha256}  ${name}`) throw new Error('安装包 SHA-256 校验文件不一致')
  if (!fs.statSync(path.join(directory, `${name}.blockmap`)).size) throw new Error('缺少有效 blockmap')
  return { version, assets: [name, `${name}.blockmap`, `${name}.sha256`, 'latest.yml'], bytes: installer.length, sha256 }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('用法：pnpm check:release <本次正式版本输出目录>')
    const metadata = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    console.log(JSON.stringify(checkUpdateRelease(path.resolve(process.argv[2]), metadata.version), null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
