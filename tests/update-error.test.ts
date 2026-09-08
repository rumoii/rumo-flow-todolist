import { expect, it } from 'vitest'
import { updateError } from '../electron/update-error'
it('classifies missing metadata without blaming authentication and bounds technical details', () => {
  const result = updateError(Object.assign(new Error('Cannot find latest.yml in latest release artifacts\n404\n' + 'detail\n'.repeat(4000)), { code: 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' }))
  expect(result.error).toContain('发布端')
  expect(result.errorDetails.length).toBeLessThanOrEqual(16000)
  expect(updateError(new Error('net::ERR_CONNECTION_RESET')).error).toContain('网络')
})
it('removes URL credentials, query strings and sensitive headers', () => {
  const result = updateError(new Error('https://alice:pass@example.com/latest.yml?token=private#secret\nAuthorization: Bearer secret-key\nCookie: session=secret-cookie'))
  expect(result.errorDetails).toContain('https://example.com/latest.yml')
  for (const secret of ['alice', 'pass', 'private', 'secret-key', 'secret-cookie']) expect(result.errorDetails).not.toContain(secret)
})
