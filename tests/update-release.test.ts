import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { checkUpdateRelease } from '../scripts/check-update-release.mjs'
const directories: string[] = []
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rumo-release-check-'))
  directories.push(directory)
  const name = 'rumo-flow-todolist-1.0.0-x64.exe'
  const data = Buffer.from('artifact fixture, not an installer')
  const sha512 = crypto.createHash('sha512').update(data).digest('base64')
  fs.writeFileSync(path.join(directory, name), data)
  fs.writeFileSync(path.join(directory, `${name}.sha256`), `${crypto.createHash('sha256').update(data).digest('hex')}  ${name}\n`)
  fs.writeFileSync(path.join(directory, `${name}.blockmap`), 'blockmap fixture')
  const metadata = { version: '1.0.0', path: name, sha512, files: [{ url: name, sha512, size: data.length }] }
  fs.writeFileSync(path.join(directory, 'latest.yml'), JSON.stringify(metadata))
  return { directory, name, metadata }
}
afterEach(() => directories.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })))
it('requires a matching stable manifest and all four assets', () => {
  const { directory } = fixture()
  expect(checkUpdateRelease(directory, '1.0.0').assets).toHaveLength(4)
  expect(() => checkUpdateRelease(directory, '1.0.0-rc.1')).toThrow('正式版本号')
  expect(() => checkUpdateRelease(directory, '1.0.1')).toThrow('不一致')
})
it('rejects tampering, mismatched hashes, missing assets and unsafe file names', () => {
  const { directory, name, metadata } = fixture()
  fs.writeFileSync(path.join(directory, name), 'tampered')
  expect(() => checkUpdateRelease(directory, '1.0.0')).toThrow('SHA-512')
  metadata.files[0].url = '../unexpected.exe'
  fs.writeFileSync(path.join(directory, 'latest.yml'), JSON.stringify(metadata))
  expect(() => checkUpdateRelease(directory, '1.0.0')).toThrow('不一致')
  const second = fixture()
  fs.writeFileSync(path.join(second.directory, `${second.name}.sha256`), 'invalid')
  expect(() => checkUpdateRelease(second.directory, '1.0.0')).toThrow('SHA-256')
  const third = fixture()
  fs.unlinkSync(path.join(third.directory, `${third.name}.blockmap`))
  expect(() => checkUpdateRelease(third.directory, '1.0.0')).toThrow()
})
