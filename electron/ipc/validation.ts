import type { BackupPayload } from '../../src/shared/contracts'
export function text(value: unknown, field: string): string {
  if (typeof value !== 'string')
    throw new Error(`${field} 必须是字符串`)
  return value
}
export function object<T>(value: unknown, field: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${field} 格式错误`)
  return value as T
}
export function ids(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error(`${field} 格式错误`)
  return value
}
export function taskPolicy(value: unknown): 'keep' | 'delete' {
  if (value === undefined)
    return 'keep'
  if (value !== 'keep' && value !== 'delete')
    throw new Error('任务处理策略无效')
  return value
}
export function parseBackup(input: BackupPayload | string): BackupPayload {
  if (typeof input === 'string')
    return JSON.parse(input) as BackupPayload
  return object<BackupPayload>(input, '备份数据')
}
