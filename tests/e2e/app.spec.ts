import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const timestamp = now.toISOString()
    const lists = [{ id: 'list-work', name: '工作', color: '#856AF9', sortOrder: 0, isPinned: false, createdAt: timestamp, updatedAt: timestamp }]
    const tasks = [{ id: 'seed-task', title: '验收初始任务', listId: 'list-work', dueDate: today, dueTime: null, reminderMinutesBefore: null, priority: 'high', notes: '浏览器验收', status: 'active', sortOrder: 0, isPinned: false, parentTaskId: null, recurrenceRuleId: null, deletedAt: null, tags: [], createdAt: timestamp, updatedAt: timestamp, completedAt: null }]
    const byId = (id: string) => tasks.find((task) => task.id === id)

    Object.defineProperty(window, 'todoApi', {
      configurable: true,
      value: {
        tasks: {
          list: async () => tasks.map((task) => ({ ...task })),
          create: async (input: Record<string, unknown>) => {
            const task = { id: crypto.randomUUID(), status: 'active', sortOrder: tasks.length, isPinned: false, parentTaskId: null, recurrenceRuleId: null, deletedAt: null, tags: [], dueTime: null, reminderMinutesBefore: null, createdAt: timestamp, updatedAt: timestamp, completedAt: null, notes: '', priority: 'none', listId: null, dueDate: null, ...input }
            tasks.push(task as typeof tasks[number])
            return { ...task }
          },
          update: async (id: string, input: Record<string, unknown>) => {
            const task = byId(id)
            if (!task) throw new Error('missing task')
            Object.assign(task, input, { updatedAt: new Date().toISOString() })
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
        tags: { list: async () => [], create: async (input: Record<string, unknown>) => ({ id: crypto.randomUUID(), color: null, createdAt: timestamp, updatedAt: timestamp, ...input }), update: async () => ({}), remove: async () => undefined },
        filters: { list: async () => [], create: async (input: Record<string, unknown>) => ({ id: crypto.randomUUID(), sortOrder: 0, createdAt: timestamp, updatedAt: timestamp, ...input }), update: async () => ({}), remove: async () => undefined },
        settings: { get: async () => ({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space' }), update: async (input: Record<string, unknown>) => ({ theme: 'light', density: 'comfortable', globalShortcut: 'Ctrl+Alt+Space', ...input }) },
        desktop: { status: async () => ({ globalShortcut: 'Ctrl+Alt+Space', globalShortcutRegistered: true }), openQuickCapture: async () => undefined, onFocusQuickAdd: () => () => undefined },
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
        backup: { export: async () => ({}), import: async () => ({ importedTasks: 0, importedLists: 0, importedRules: 0 }) },
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
  await newTaskRow.click()
  await expect(page.getByText('任务详情')).toBeVisible()
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

  await page.locator('.pinned-zone').getByText('验收初始任务').click()
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
