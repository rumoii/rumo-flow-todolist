import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronState = vi.hoisted(() => ({ supported: true, notifications: [] as Array<{ options: { title: string; body: string }; listeners: Record<string, () => void>; show: ReturnType<typeof vi.fn> }> }))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  Notification: class {
    listeners: Record<string, () => void> = {}
    show = vi.fn()
    constructor(readonly options: { title: string; body: string }) { electronState.notifications.push(this) }
    static isSupported() { return electronState.supported }
    on(event: string, listener: () => void) { this.listeners[event] = listener }
  },
}))

import { ReminderScheduler } from '../electron/reminders'
import type { Repository } from '../electron/database/repository'

describe('ReminderScheduler flow reminder lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-30T21:59:59')); electronState.supported = true; electronState.notifications.length = 0 })
  afterEach(() => { vi.useRealTimers() })

  it('claims, displays and routes one scheduled flow reminder, then disposes its timer', async () => {
    const showFlow = vi.fn()
    const repository = {
      purgeDeleted: vi.fn(),
      dueReminders: vi.fn(() => []),
      nextReminder: vi.fn(() => null),
      nextFlowReviewReminder: vi.fn().mockReturnValueOnce({ date: '2026-08-30', remindAt: new Date('2026-08-30T22:00:00') }).mockReturnValue(null),
      claimFlowReviewReminder: vi.fn(() => true),
    } as unknown as Repository
    const scheduler = new ReminderScheduler({ tasks: repository, flow: repository } as never, vi.fn(), showFlow)

    scheduler.start()
    await vi.advanceTimersByTimeAsync(1000)

    expect(repository.claimFlowReviewReminder).toHaveBeenCalledWith('2026-08-30')
    expect(electronState.notifications).toHaveLength(1)
    expect(electronState.notifications[0].options.title).toBe('Rumo-Flow · 心流')
    expect(electronState.notifications[0].show).toHaveBeenCalledOnce()
    electronState.notifications[0].listeners.click()
    expect(showFlow).toHaveBeenCalledOnce()

    scheduler.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not consume a task reminder when desktop notifications are unavailable', () => {
    electronState.supported = false
    const task = { id: 'task-1', title: '稍后提醒' }
    const repository = {
      purgeDeleted: vi.fn(),
      dueReminders: vi.fn(() => [{ task, remindAt: new Date() }]),
      nextReminder: vi.fn(() => null),
      nextFlowReviewReminder: vi.fn(() => null),
      markReminderNotified: vi.fn(),
    } as unknown as Repository
    const scheduler = new ReminderScheduler({ tasks: repository, flow: repository } as never, vi.fn(), vi.fn())

    scheduler.start()

    expect(repository.markReminderNotified).not.toHaveBeenCalled()
    expect(electronState.notifications).toHaveLength(0)
    scheduler.dispose()
  })
})
