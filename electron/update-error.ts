export function updateError(error: unknown): { error: string; errorDetails: string } {
  const message = error instanceof Error ? error.message : String(error ?? '未知错误')
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  const missing = code === 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND' || /Cannot find latest\.yml|latest\.yml[^\n]*404/i.test(message)
  const network = /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ERR_NETWORK|net::ERR_|network|socket hang up/i.test(`${code} ${message}`)
  const errorDetails = message
    .replace(/https?:\/\/[^\s"<>]+/gi, value => {
      try { const url = new URL(value); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString() }
      catch { return '[链接已隐藏]' }
    })
    .replace(/(["']?(?:authorization|cookie|set-cookie|token|access_token|password|secret|api[-_]key)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\r\n,;]+)/gi, '$1[已隐藏]')
    .slice(0, 16000)
  return { error: missing ? '发布端暂未提供完整更新信息，请稍后重试。' : network ? '无法连接更新服务，请检查网络后重试。' : '更新操作未完成，请重试或查看技术详情。', errorDetails }
}
