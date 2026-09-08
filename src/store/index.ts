export { archiveTask, collectArchivable, unarchiveTask, withoutBlockedDependents } from './ArchiveOps'
export type { ArchiveCandidate } from './ArchiveOps'
export { ProjectStore, TaskFileNameConflictError } from './ProjectStore'
export type { ImportNoteOptions, TaskSource } from './TaskSource'
export { computeSchedule, wouldCreateCycle } from './Scheduler'
export { mergeById } from './ProjectConfig'
export {
  applyTaskFilter,
  applyTaskFilterFlat,
  applyTaskFilterPromote,
  countActiveFilters,
  isFilterActive,
  matchesFilter
} from './TaskFilter'
export {
  buildTaskIndex,
  findParentId,
  findTaskById,
  indexAddSubtree,
  indexRemoveSubtree,
  indexSetParent,
  rebuildTaskIndex
} from './TaskIndex'
export type { TaskIndex, TaskIndexEntry } from './TaskIndex'
export {
  addTaskToTree,
  cloneTaskSubtree,
  collectAllAssignees,
  collectAllTags,
  deleteTaskFromTree,
  filterArchived,
  findTask,
  flattenTasks,
  moveTaskInTree,
  totalLoggedHours,
  updateTaskInTree
} from './TaskTreeOps'
export type { FlatTask } from './TaskTreeOps'
export { ProjectScope, resolveScopePaths, scopeKey } from './ProjectScope'
export type { ScopeSpec } from './ProjectScope'
export { VaultIndex } from './VaultIndex'
export type { ProjectRef, TaskRef } from './VaultIndex'
export {
  TAG_SPRINT_CURRENT,
  TAG_SPRINT_NEXT,
  applySprintTag,
  hoursByActor,
  isPastSprintTag,
  pastSprintTag,
  retagCurrentToPast,
  sprintMembership,
  toggleSprintTag
} from './sprintTags'
export type { SprintLane } from './sprintTags'
export {
  closeWeekConfirmCopy,
  sprintConfirmCopy,
  sprintLaneLabel,
  sprintTreeSize,
  writeCloseWeek,
  writeSprintLane
} from './sprintApply'
export {
  buildSprintColumn,
  buildSprintColumnFromTag,
  detailsFromFrontmatter,
  listPastSprintTags,
  sprintMembers,
  sprintMembersForTag,
  tagForLane
} from './sprintBoard'
export type { SprintColumnModel, SprintProjectNode, SprintTaskDetails, SprintTaskNode } from './sprintBoard'
export {
  createPersonLink,
  createPersonNote,
  matchPersonNotes,
  personCandidates,
  personKey,
  personKeyer,
  personLink,
  personNotes,
  resolvePeople,
  resolvePerson
} from './people'
export type { PersonCandidate, PersonLinkState, PersonMatch, PersonRef } from './people'
export { folderOf, projectFolderOf, projectPathForTaskPath, projectTaskFolder, TASK_FOLDER_NAME } from './vaultFs'
export { hydrateTasks } from './YamlHydrator'
export { appendYaml, isOldFormat, parseFrontmatter } from './YamlParser'
export { projectFilePath, serializeProject, serializeTask } from './YamlSerializer'
