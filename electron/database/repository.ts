import { TaskRepository } from './tasks'
import { OrganizationRepository } from './organization'
import { FlowRepository } from './flow'
import { SettingsRepository } from './settings'
import { BackupService } from './backup'
import { DraftRepository } from './drafts'
export class Repository {
  readonly settings = new SettingsRepository()
  readonly tasks = new TaskRepository()
  readonly organization = new OrganizationRepository()
  readonly flow = new FlowRepository(this.settings)
  readonly drafts = new DraftRepository(this.tasks, this.flow, this.organization)
  readonly backup = new BackupService(this.tasks, this.organization, this.flow, this.settings, this.drafts)
}
