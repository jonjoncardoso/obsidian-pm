import { formatRelativeTime, taskLastEdited, type EditableTaskNode } from '../../../dates'

export interface LastEditedCellProps {
  task: EditableTaskNode
}

export class LastEditedCell {
  el: HTMLTableCellElement

  constructor(parentRow: HTMLElement, props: LastEditedCellProps) {
    this.el = parentRow.createEl('td', { cls: 'pm-table-cell pm-table-cell-last-edited' })
    const latest = taskLastEdited(props.task)
    this.el.createSpan({
      cls: latest ? 'pm-project-row-last-edited' : 'pm-project-row-empty',
      text: latest ? formatRelativeTime(latest) : '—'
    })
  }
}
