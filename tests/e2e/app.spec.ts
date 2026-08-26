import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const timestamp = now.toISOString()
    const lists = [{ id: 'list-work', name: '工作', color: '#856AF9', sortOrder: 0, createdAt: timestamp, updatedAt: timestamp }]
    const tasks = [{ id: 'seed-task', title: '验收初始任务', listId: 'list-work', dueDate: today, priority: 'high', notes: '浏览器验收', status: 'active', sortOrder: 0, parentTaskId: null, recurrenceRuleId: null, createdAt: timestamp, updatedAt: timestamp, completedAt: null }]
    const byId = (id: string) => tasks.find((task) => task.id === id)

    Object.defineProperty(window, 'todoApi', {
      configurable: true,
      value: {
        tasks: {
          list: async () => tasks.map((task) => ({ ...task })),
          create: async (input: Record<string, unknown>) => {
            const task = { id: crypto.randomUUID(), status: 'active', sortOrder: tasks.length, parentTaskId: null, recurrenceRuleId: null, createdAt: timestamp, updatedAt: timestamp, completedAt: null, notes: '', priority: 'none', listId: null, dueDate: null, ...input }
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
        },
        lists: {
          list: async () => lists.map((list) => ({ ...list })),
          create: async (input: Record<string, unknown>) => {
            const list = { id: crypto.randomUUID(), color: '#856AF9', sortOrder: lists.length, createdAt: timestamp, updatedAt: timestamp, ...input }
            lists.push(list as typeof lists[number])
            return { ...list }
          },
          update: async () => ({ ...lists[0] }),
          remove: async () => undefined,
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
