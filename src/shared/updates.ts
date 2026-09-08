export type UpdatePhase = 'unsupported' | 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'downloaded' | 'installing' | 'error'
export interface UpdateState {
  phase: UpdatePhase
  version: string
  platform: string
  arch: string
  nextVersion?: string
  notes?: string
  progress?: number
  error?: string
  errorDetails?: string
}
export interface UpdatesApi {
  status(): Promise<UpdateState>
  check(): Promise<void>
  download(): Promise<void>
  cancel(): Promise<void>
  install(): Promise<void>
  feedback(): Promise<void>
  copyInfo(): Promise<void>
  onChanged(callback: (state: UpdateState) => void): () => void
}
