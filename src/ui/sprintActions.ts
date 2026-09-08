import { Menu } from 'obsidian'
import { sprintMembership, toggleSprintTag, type SprintLane } from '../store/sprintTags'

export function addSprintMenuItems(menu: Menu, tags: string[], onTags: (tags: string[]) => void): void {
  const membership = sprintMembership(tags)
  addLaneItem(menu, tags, 'current', membership === 'current' ? 'In sprint' : 'Add to sprint', onTags)
  addLaneItem(menu, tags, 'next', membership === 'next' ? 'In next sprint' : 'Add to next sprint', onTags)
}

function addLaneItem(
  menu: Menu,
  tags: string[],
  lane: SprintLane,
  title: string,
  onTags: (tags: string[]) => void
): void {
  menu.addItem((item) =>
    item
      .setTitle(title)
      .setIcon(lane === 'current' ? 'calendar-check' : 'calendar-plus')
      .onClick(() => onTags(toggleSprintTag(tags, lane)))
  )
}
