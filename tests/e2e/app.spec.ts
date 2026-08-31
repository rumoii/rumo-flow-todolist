import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const timestamp = now.toISOString()
    const lists = [{ id: 'list-work', name: '工作', color: '#856AF9', sortOrder: 0, isPinned: false, createdAt: timestamp, updatedAt: timestamp }]
    const tags: Array<{ id: string; name: string; color: string | null; createdAt: string; updatedAt: string }> = []
    const tasks = [{ id: 'seed-task', title: '验收初始任务', listId: 'list-work', dueDate: today, dueTime: null, reminderMinutesBefore: null, priority: 'high', notes: '浏览器验收', status: 'active', sortOrder: 0, isPinned: false, parentTaskId: null, recurrenceRuleId: null, deletedAt: null, tags: [], createdAt: timestamp, updatedAt: timestamp, completedAt: null }]
    const flowReview = { date: today, videoLimit: 3, didWell: '', didNotWell: '', reflection: '', inputType: 'none', inputVideoId: null, inputText: '', outputText: '', tomorrowExpectation: '', savedAt: null as string | null, createdAt: timestamp, updatedAt: timestamp }
    const flowVideos: Array<{ id: string; date: string; title: string; sourceUrl: string; sourcePlatform: string; author: string; thought: string; createdAt: string; updatedAt: string }> = []
    const byId = (id: string) => tasks.find((task) => task.id === id)

    Object.defineProperty(window, 'todoApi', {
      configurable: true,
      value: {
        tasks: {
          list: async () => tasks.map((task) => ({ ...task })),
          create: async (input: Record<string, unknown>) => {
            const tagIds = (input.tagIds as string[] | undefined) ?? []
            const task = { id: crypto.randomUUID(), status: 'active', sortOrder: tasks.length, isPinned: false, parentTaskId: null, recurrenceRuleId: null, deletedAt: null, tags: tags.filter((tag) => tagIds.includes(tag.id)), dueTime: null, reminderMinutesBefore: null, createdAt: timestamp, updatedAt: timestamp, completedAt: null, notes: '', priority: 'none', listId: null, dueDate: null, ...input }
            delete (task as Record<string, unknown>).tagIds
            tasks.push(task as typeof tasks[number])
            return { ...task }
          },
          update: async (id: string, input: Record<string, unknown>) => {
            const task = byId(id)
            if (!task) throw new Error('missing task')
            const tagIds = input.tagIds as string[] | undefined
            Object.assign(task, input, tagIds ? { tags: tags.filter((tag) => tagIds.includes(tag.id)) } : {}, { updatedAt: new Date().toISOString() })
            delete (task as Record<string, unknown>).tagIds
            return { ...task }
          },
          complete: async (id: string) => {
            const task = byId(id)
            if (task) Object.assign(task, { status: 'completed', completedAt: new Date().toISOString() })
          },
          restore: async (id: string) => {
            const task = byId(id)
            if (task) Object.assign(task, { status: 'active', completedAt: null })
          },
          remove: async (id: string) => {
            const index = tasks.findIndex((task) => task.id === id)
            if (index >= 0) tasks.splice(index, 1)
          },
          restoreRemoved: async () => undefined,
          reorder: async (ids: string[]) => ids.forEach((id, index) => { const task = byId(id); if (task) task.sortOrder = index }),
        },
        tags: {
          list: async () => tags.map((tag) => ({ ...tag })),
          create: async (input: Record<string, unknown>) => {
            const tag = { id: crypto.randomUUID(), name: String(input.name), color: (input.color as string | null | undefined) ?? null, createdAt: timestamp, updatedAt: timestamp }
            tags.push(tag)
            return { ...tag }
          },
          update: async (id: string, input: Record<string, unknown>) => {
            const tag = tags.find((item) => item.id === id)
            if (!tag) throw new Error('missing tag')
            Object.assign(tag, input, { updatedAt: new Date().toISOString() })
            tasks.forEach((task) => task.tags.filter((item) => item.id === id).forEach((item) => Object.assign(item, tag)))
            return { ...tag }
          },
          remove: async (id: string) => {
            const index = tags.findIndex((tag) => tag.id === id)
            if (index >= 0) tags.splice(index, 1)
            tasks.forEach((task) => { task.tags = task.tags.filter((tag) => tag.id !== id) })
          },
        },
        filters: { list: async () => [], create: async (input: Record<string, unknown>) => ({ id: crypto.randomUUID(), sortOrder: 0, createdAt: timestamp, updatedAt: timestamp, ...input }), update: async () => ({}), remove: async () => undefined },
        flow: {
          getDay: async () => ({ review: { ...flowReview }, videos: flowVideos.map((video) => ({ ...video })) }),
          createVideo: async (input: { date: string; title?: string; sourceUrl: string; author?: string }) => { const video = { id: crypto.randomUUID(), date: input.date, title: input.title ?? '', sourceUrl: input.sourceUrl, sourcePlatform: '抖音', author: input.author ?? '', thought: '', createdAt: timestamp, updatedAt: timestamp }; flowVideos.push(video); return { ...video } },
          updateVideo: async (id: string, input: Record<string, unknown>) => { const video = flowVideos.find((item) => item.id === id)!; Object.assign(video, input, { updatedAt: new Date().toISOString() }); return { ...video } },
          removeVideo: async (id: string) => { const index = flowVideos.findIndex((item) => item.id === id); if (index >= 0) flowVideos.splice(index, 1) },
          saveReview: async (input: Record<string, unknown>) => { Object.assign(flowReview, input, { savedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }); return { ...flowReview } },
          month: async () => flowVideos.length || flowReview.savedAt ? [{ date: today, videoLimit: 3, videoCount: flowVideos.length, pendingThoughtCount: flowVideos.filter((video) => !video.thought).length, reviewSaved: Boolean(flowReview.savedAt), overLimit: flowVideos.length > 3 }] : [],
          summary: async () => ({ from: today, to: today, reviewedDays: flowReview.savedAt ? 1 : 0, videoCount: flowVideos.length, overLimitDays: flowVideos.length > 3 ? 1 : 0, pendingThoughts: flowVideos.filter((video) => !video.thought).length }),
        },
        settings: { get: async () => ({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00' }), update: async (input: Record<string, unknown>) => ({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', dailyVideoLimit: 3, reviewReminderEnabled: true, reviewReminderTime: '22:00', ...input }) },
        desktop: { status: async () => ({ globalShortcut: 'Ctrl+Alt+Space', globalShortcutRegistered: true }), openQuickCapture: async () => undefined, openExternal: async () => undefined, onFocusQuickAdd: () => () => undefined, onOpenFlow: () => () => undefined },
        lists: {
          list: async () => lists.map((list) => ({ ...list })),
          create: async (input: Record<string, unknown>) => {
            const list = { id: crypto.randomUUID(), color: '#856AF9', sortOrder: lists.length, isPinned: false, createdAt: timestamp, updatedAt: timestamp, ...input }
            lists.push(list as typeof lists[number])
            return { ...list }
          },
          update: async (id: string, input: Record<string, unknown>) => {
            const list = lists.find((item) => item.id === id)
            if (!list) throw new Error('missing list')
            Object.assign(list, input, { updatedAt: new Date().toISOString() })
            return { ...list }
          },
          remove: async (id: string, options: { taskPolicy?: 'keep' | 'delete' } = {}) => {
            if (options.taskPolicy === 'delete') {
              for (let index = tasks.length - 1; index >= 0; index -= 1) if (tasks[index].listId === id) tasks.splice(index, 1)
            } else tasks.forEach((task) => { if (task.listId === id) task.listId = null })
            const index = lists.findIndex((list) => list.id === id)
            if (index >= 0) lists.splice(index, 1)
          },
          reorder: async (ids: string[]) => ids.forEach((id, index) => { const list = lists.find((item) => item.id === id); if (list) list.sortOrder = index }),
        },
        backup: { export: async () => ({}), import: async () => ({ importedTasks: 0, importedLists: 0, importedRules: 0, importedReviews: 0, importedVideos: 0 }) },
      },
    })
  })
})

test('creates, completes and edits a task without console or page errors', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible()
  await expect(page.getByText('验收初始任务')).toBeVisible()

  const quickInput = page.getByPlaceholder('添加一个任务，按 Enter 保存…')
  await quickInput.fill('浏览器新增任务')
  await quickInput.press('Enter')
  await expect(page.getByText('浏览器新增任务')).toBeVisible()

  const newTaskRow = page.locator('.task-row').filter({ hasText: '浏览器新增任务' })
  await newTaskRow.locator('.task-main').click()
  await expect(page.getByText('任务详情')).toBeVisible()
  await expect(page.locator('.detail-card')).toHaveCount(5)
  await page.getByRole('combobox', { name: '任务提醒' }).click()
  await page.getByRole('option', { name: '提前 1 小时' }).click()
  await page.locator('.title-input').fill('浏览器编辑任务')
  await page.getByRole('button', { name: '保存更改' }).click()
  await expect(page.getByText('浏览器编辑任务')).toBeVisible()

  await page.getByRole('button', { name: '关闭' }).click()
  await page.locator('.task-row').filter({ hasText: '浏览器编辑任务' }).locator('.check').click()
  await page.getByRole('button', { name: /已完成/ }).click()
  await expect(page.getByText('浏览器编辑任务')).toBeVisible()
  expect(errors).toEqual([])
})

test('keeps the core layout usable at a narrow desktop window', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/')
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.main-content')).toBeVisible()
  await expect(page.getByPlaceholder('搜索任务')).toBeVisible()
  const bodyWidth = await page.locator('body').evaluate((element) => element.scrollWidth)
  expect(bodyWidth).toBeLessThanOrEqual(1024)
})

test('keeps weekly task titles horizontal and removes the unused account placeholder', async ({ page }) => {
  await page.goto('/')
  const quickInput = page.getByPlaceholder('添加一个任务，按 Enter 保存…')
  await quickInput.fill('系统升级平台要升级这是一个很长的周任务标题')
  await quickInput.press('Enter')
  await page.getByRole('button', { name: '本周' }).click()

  const card = page.locator('.task-card').filter({ hasText: '系统升级平台要升级' })
  const title = card.locator('.task-title')
  await expect(card).toBeVisible()
  await expect(page.locator('.avatar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '设置' })).toBeVisible()

  const titleStyle = await title.evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      lineClamp: styles.getPropertyValue('-webkit-line-clamp'),
      lineHeight: Number.parseFloat(styles.lineHeight),
      wordBreak: styles.wordBreak,
      box: element.getBoundingClientRect().toJSON(),
    }
  })
  expect(titleStyle.lineClamp).toBe('2')
  expect(titleStyle.wordBreak).toBe('normal')
  expect(titleStyle.box.width).toBeGreaterThan(titleStyle.box.height)
  expect(titleStyle.box.height).toBeLessThanOrEqual(titleStyle.lineHeight * 2 + 1)

  const priorityCard = page.locator('.task-card').filter({ hasText: '验收初始任务' })
  const cardBox = await priorityCard.boundingBox()
  const badgeBox = await priorityCard.locator('.priority-badge').boundingBox()
  expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width)
})

test('pins tasks, changes priority and exposes subtasks near the top of details', async ({ page }) => {
  await page.goto('/')
  const taskRow = page.locator('.task-row').filter({ hasText: '验收初始任务' })
  await taskRow.getByRole('button', { name: '任务操作' }).click()
  await page.getByRole('button', { name: '置顶任务' }).click()
  await expect(page.locator('.pinned-zone').getByText('验收初始任务')).toBeVisible()

  await page.locator('.pinned-zone').getByRole('button', { name: '任务操作' }).click()
  await page.getByRole('button', { name: /P3/ }).click()
  await expect(page.locator('.pinned-zone').getByText('P3')).toBeVisible()

  await page.locator('.pinned-zone').locator('.task-main').filter({ hasText: '验收初始任务' }).click()
  const subtaskComposer = page.getByPlaceholder('添加子任务…')
  await expect(subtaskComposer).toBeVisible()
  const composerBox = await subtaskComposer.boundingBox()
  const listFieldBox = await page.getByText('清单', { exact: true }).boundingBox()
  expect(composerBox!.y).toBeLessThan(listFieldBox!.y)
})

test('pins and deletes a list through the three-dot menu while keeping tasks by default', async ({ page }) => {
  await page.goto('/')
  await page.locator('.list-items').last().getByRole('button', { name: '清单操作' }).click()
  await page.getByRole('button', { name: '置顶清单' }).click()
  await expect(page.getByText('置顶', { exact: true }).first()).toBeVisible()

  await page.locator('.list-items').first().getByRole('button', { name: '清单操作' }).click()
  await page.getByRole('button', { name: '删除清单' }).click()
  await expect(page.getByRole('heading', { name: /删除清单/ })).toBeVisible()
  await page.getByRole('button', { name: '确认删除' }).click()
  await expect(page.getByText('工作', { exact: true })).toHaveCount(0)
  await expect(page.getByText('验收初始任务')).toBeVisible()
})

test('drags a task into the pin zone and reorders custom lists', async ({ page }) => {
  await page.goto('/')
  const taskRow = page.locator('.task-row').filter({ hasText: '验收初始任务' })
  await taskRow.dragTo(page.locator('.pinned-zone'))
  await expect(page.locator('.pinned-zone').getByText('验收初始任务')).toBeVisible()

  await page.getByRole('button', { name: '新建清单' }).click()
  await page.getByPlaceholder('清单名称').fill('个人')
  await page.getByPlaceholder('清单名称').press('Enter')
  const personalRow = page.locator('.list-row').filter({ hasText: '个人' })
  const workRow = page.locator('.list-row').filter({ hasText: '工作' })
  await personalRow.dragTo(workRow)
  await expect(page.locator('.list-name').first()).toHaveText('个人')
})

test('uses unified motion tokens and honors reduced-motion preferences', async ({ page }) => {
  await page.goto('/')
  const motion = await page.locator('html').evaluate((element) => {
    const styles = getComputedStyle(element)
    return {
      base: styles.getPropertyValue('--motion-base').trim(),
      smooth: styles.getPropertyValue('--motion-smooth').trim(),
    }
  })
  expect(motion.base).toContain('300ms')
  expect(motion.smooth).toContain('cubic-bezier(.23,1,.32,1)')

  await page.getByRole('button', { name: '即将到期' }).click()
  await expect(page.getByRole('heading', { name: '即将到期' })).toBeVisible()

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedDuration = await page.locator('.primary-action').evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(Number.parseFloat(reducedDuration)).toBeLessThanOrEqual(0.00001)
})

test('shows a readable saved-filter form and restrained select motion', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '新建筛选' }).click()
  await expect(page.locator('.filter-field-row>span')).toHaveText(['状态', '清单', '优先级', '标签', '日期'])
  await expect(page.getByRole('combobox', { name: '筛选状态' })).toContainText('进行中')
  await expect(page.getByRole('combobox', { name: '筛选清单' })).toContainText('任意清单')
  await expect(page.getByRole('combobox', { name: '筛选优先级' })).toContainText('任意优先级')
  await expect(page.getByRole('combobox', { name: '筛选标签' })).toContainText('任意标签')
  await expect(page.getByRole('combobox', { name: '筛选日期' })).toContainText('任意日期')

  const fieldWidth = await page.getByRole('combobox', { name: '筛选状态' }).evaluate((element) => element.getBoundingClientRect().width)
  expect(fieldWidth).toBeGreaterThan(100)
  await page.waitForTimeout(220)

  const statusField = page.getByRole('combobox', { name: '筛选状态' })
  const before = await statusField.boundingBox()
  await statusField.click()
  const after = await statusField.boundingBox()
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(0.5)
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(0.5)
  await expect(page.getByRole('listbox', { name: '筛选状态' })).toBeVisible()
})

test('renders the branded quick capture panel without overflow', async ({ page }) => {
  await page.goto('/?capture=1')
  await expect(page.locator('.capture-card')).toBeVisible()
  await expect(page.getByText('快速捕获')).toBeVisible()
  const dimensions = await page.evaluate(() => ({ bodyWidth: document.body.scrollWidth, viewportWidth: window.innerWidth, bodyHeight: document.body.scrollHeight, viewportHeight: window.innerHeight }))
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth)
  expect(dimensions.bodyHeight).toBeLessThanOrEqual(dimensions.viewportHeight)
  await page.getByRole('textbox', { name: '快速捕获任务' }).fill('浏览器快速捕获 #验收')
  await page.getByRole('textbox', { name: '快速捕获任务' }).press('Enter')
  await expect(page.getByText('已加入收集箱')).toBeVisible()
})

test('keeps the today count and task list in sync for undated list tasks', async ({ page }) => {
  await page.goto('/')
  await page.locator('.list-items .nav-item').filter({ hasText: '工作' }).click()
  await page.getByPlaceholder('添加一个任务，按 Enter 保存…').fill('清单无日期任务')
  await page.getByPlaceholder('添加一个任务，按 Enter 保存…').press('Enter')

  const todayButton = page.locator('.nav-group .nav-item').filter({ hasText: '今天' })
  await expect(todayButton.locator('em')).toHaveText('2')
  await todayButton.click()
  await expect(page.getByText('清单无日期任务')).toBeVisible()
  await expect(page.getByText('未安排日期')).toBeVisible()
})

test('creates tags from Quick Add and details, then filters without opening details', async ({ page }) => {
  await page.goto('/')
  const quickInput = page.getByPlaceholder('添加一个任务，按 Enter 保存…')
  await quickInput.fill('标签验收任务 #研发')
  await quickInput.press('Enter')

  const taggedRow = page.locator('.task-row').filter({ hasText: '标签验收任务' })
  await expect(taggedRow.getByRole('button', { name: '#研发' })).toBeVisible()
  await taggedRow.getByRole('button', { name: '#研发' }).click()
  await expect(page.getByText('当前标签：#研发')).toBeVisible()
  await expect(page.getByText('任务详情')).toHaveCount(0)

  await taggedRow.locator('.task-main').click()
  await page.getByPlaceholder('搜索或输入新标签').fill('重点')
  await page.getByRole('button', { name: /创建并添加“重点”/ }).click()
  await page.getByRole('button', { name: '保存更改' }).click()
  await page.getByRole('button', { name: '关闭' }).click()
  await expect(taggedRow.getByRole('button', { name: '#重点' })).toBeVisible()
})

test('registers an intentional video and saves a daily flow review', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 })
  await page.goto('/')
  const primaryNavigation = await page.locator('.nav-group > .nav-item').allTextContents()
  expect(primaryNavigation.map((label) => label.replace(/\d+/g, '').trim())).toEqual(['✦ 收集箱', '☀ 今天', '▦ 本周', '◷ 即将到期', '✓ 已完成'])
  await expect(page.locator('.nav-group + .flow-nav-section')).toBeVisible()
  await page.getByRole('button', { name: /心流/ }).click()
  await expect(page.getByRole('heading', { name: '心流' })).toBeVisible()
  await page.getByPlaceholder('https://…').fill('https://www.douyin.com/video/123')
  await page.getByRole('button', { name: '暂存并打开' }).click()
  await expect(page.getByText('待补充标题', { exact: true })).toBeVisible()
  await expect(page.getByText('待补思考', { exact: true })).toBeVisible()

  await page.getByPlaceholder('看完后，这条视频讲了什么？').fill('慢下来再输入')
  await page.getByPlaceholder('我认同或不认同什么？它和我的经历有什么关系？').fill('先明确观看目的，再决定是否值得投入注意力。')
  await page.getByRole('button', { name: '保存记录' }).click()
  await expect(page.getByText('已思考')).toBeVisible()
  await page.getByRole('tab', { name: /每日复盘/ }).click()
  await page.getByPlaceholder('哪件事值得肯定？').fill('完成了最重要的任务')
  await page.getByRole('button', { name: '保存今日复盘' }).click()
  await expect(page.locator('.saved-pill')).toHaveText('已保存')
  expect(await page.locator('body').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(1024)
})
