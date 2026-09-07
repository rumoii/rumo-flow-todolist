import type { IpcContext } from './context'
import { text, object } from './validation'
import type { CreateVideoReflectionInput, SaveDailyReviewInput, UpdateVideoReflectionInput } from '../../src/shared/contracts'
export function registerFlow({ repository, options, handle, changed }: IpcContext): void {
  handle('flow:get-day', (_event, date) => repository.flow.getFlowDay(text(date, '日期')))
  handle('flow:save-review', (_event, input) => { const result = repository.flow.saveFlowReview(object<SaveDailyReviewInput>(input, '每日复盘')); options.onScheduleChanged?.(); return result; })
  handle('flow:create-video', (_event, input) => repository.flow.createFlowVideo(object<CreateVideoReflectionInput>(input, '视频记录')))
  handle('flow:update-video', (_event, videoId, input) => repository.flow.updateFlowVideo(text(videoId, '视频记录编号'), object<UpdateVideoReflectionInput>(input, '视频记录')))
  handle('flow:remove-video', (_event, videoId) => repository.flow.removeFlowVideo(text(videoId, '视频记录编号')))
  handle('flow:month', (_event, month) => repository.flow.listFlowMonth(text(month, '月份')))
  handle('flow:summary', (_event, days) => repository.flow.getFlowSummary(days === undefined ? 7 : Number(days)))
}
