import {
  InstrumentationRuntime,
  isHeatmapPreview,
} from './instrumentation'
import { Analytics } from './analytics'

const originalParent = Object.getOwnPropertyDescriptor(window, 'parent')

function setPreviewURL() {
  window.history.replaceState({}, '', '/?ferno_preview=1')
  Object.defineProperty(window, 'parent', {
    configurable: true,
    value: {},
  })
}

afterEach(() => {
  window.history.replaceState({}, '', '/')
  if (originalParent) Object.defineProperty(window, 'parent', originalParent)
})

describe('heatmap previews', () => {
  it('detects embedded preview sessions', () => {
    setPreviewURL()

    expect(isHeatmapPreview()).toBe(true)
  })

  it('blocks activation while allowing scrolling events', () => {
    setPreviewURL()
    const button = document.createElement('button')
    const activated = jest.fn()
    button.addEventListener('click', activated)
    document.body.appendChild(button)

    const runtime = new InstrumentationRuntime(jest.fn())
    runtime.start()

    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    button.dispatchEvent(click)
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true })
    window.dispatchEvent(wheel)

    expect(click.defaultPrevented).toBe(true)
    expect(activated).not.toHaveBeenCalled()
    expect(wheel.defaultPrevented).toBe(false)

    runtime.stop()
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(activated).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch events from the embedded page', async () => {
    setPreviewURL()
    const analytics = new Analytics({ writeKey: 'preview-test' })
    const dispatch = jest.spyOn(analytics.queue, 'dispatch')

    await analytics.track('Preview event')

    expect(dispatch).not.toHaveBeenCalled()
  })
})
