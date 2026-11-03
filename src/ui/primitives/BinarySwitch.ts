export interface BinarySwitchSide<T extends string> {
  id: T
  label: string
}

export interface BinarySwitchProps<T extends string> {
  left: BinarySwitchSide<T>
  right: BinarySwitchSide<T>
  value: T
  onChange: (id: T) => void
  /** Name for the switch control (labels already sit beside the track). */
  ariaLabel?: string
}

/**
 * Two-sided mode switch: labels flank a sliding track.
 * Not a checkbox and not a pair of CTA buttons.
 * `aria-checked` is true when the right side is active.
 */
export class BinarySwitch<T extends string> {
  el: HTMLElement
  private track: HTMLButtonElement
  private leftLabel: HTMLElement
  private rightLabel: HTMLElement
  private left: BinarySwitchSide<T>
  private right: BinarySwitchSide<T>
  private value: T
  private onChange: (id: T) => void

  constructor(parentEl: HTMLElement, props: BinarySwitchProps<T>) {
    this.left = props.left
    this.right = props.right
    this.value = props.value
    this.onChange = props.onChange

    this.el = parentEl.createDiv('pm-binary-switch')
    this.leftLabel = this.el.createSpan({ cls: 'pm-binary-switch-label', text: props.left.label })
    this.track = this.el.createEl('button', {
      cls: 'pm-binary-switch-track',
      attr: {
        type: 'button',
        role: 'switch',
        'aria-label': props.ariaLabel ?? `${props.left.label} or ${props.right.label}`
      }
    })
    this.track.createSpan({ cls: 'pm-binary-switch-thumb' })
    this.rightLabel = this.el.createSpan({ cls: 'pm-binary-switch-label', text: props.right.label })

    this.apply(props.value)

    this.track.addEventListener('click', (e) => {
      e.preventDefault()
      this.toggle()
    })
    this.leftLabel.addEventListener('click', () => this.select(props.left.id))
    this.rightLabel.addEventListener('click', () => this.select(props.right.id))
  }

  private apply(value: T): void {
    this.value = value
    const rightOn = value === this.right.id
    this.track.setAttribute('aria-checked', rightOn ? 'true' : 'false')
    this.el.toggleClass('pm-binary-switch--right', rightOn)
    this.leftLabel.toggleClass('pm-binary-switch-label--active', !rightOn)
    this.rightLabel.toggleClass('pm-binary-switch-label--active', rightOn)
  }

  private select(id: T): void {
    if (id === this.value) return
    this.apply(id)
    this.onChange(id)
  }

  private toggle(): void {
    this.select(this.value === this.left.id ? this.right.id : this.left.id)
  }
}
