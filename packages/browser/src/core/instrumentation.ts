import { normalizeEventUrl } from './page'

export const FERNO_EVENT_NAMES = {
  AUTOCAPTURE: 'autocapture',
  RAGE_CLICK: 'rage_click',
  DEAD_CLICK: 'dead_click',
  PAGE_VIEW: 'page_view',
  PAGE_LEAVE: 'page_leave',
  EXCEPTION: 'exception',
  HEATMAP: 'heatmap',
} as const

export type FernoEventName =
  typeof FERNO_EVENT_NAMES[keyof typeof FERNO_EVENT_NAMES]
export type InstrumentationPointType =
  | 'click'
  | 'rage_click'
  | 'dead_click'
  | 'mousemove'

export interface InstrumentationOptions {
  autocapture?: boolean | { enabled?: boolean }
  rageClicks?:
    | boolean
    | { enabled?: boolean; count?: number; timeout?: number; distance?: number }
  deadClicks?: boolean | { enabled?: boolean; observationWindow?: number }
  navigation?: boolean | { enabled?: boolean; hash?: boolean }
  exceptions?: boolean | { enabled?: boolean; console?: boolean }
  heatmaps?:
    | boolean
    | { enabled?: boolean; flushInterval?: number; maxPoints?: number }
}

export interface ElementFingerprint {
  tag: string
  id?: string
  classes?: string[]
  role?: string
  text?: string
  name?: string
  type?: string
  path?: string
}
const limit = (value: string, size: number) =>
  value.length > size ? `${value.slice(0, size)}…` : value

const sensitive = (element: Element) =>
  element.matches('[data-ph-mask], .ph-mask') ||
  element.closest('[data-ph-mask], .ph-mask') !== null

export function fingerprintElement(
  element: Element | null
): ElementFingerprint | undefined {
  if (!element) return undefined
  const html = element as HTMLElement
  const tag = element.tagName.toLowerCase()
  const result: ElementFingerprint = { tag }
  if (html.id) result.id = limit(html.id, 80)
  const classes = Array.from(element.classList).filter(Boolean).slice(0, 8)
  if (classes.length) result.classes = classes.map((item) => limit(item, 60))
  const role = element.getAttribute('role')
  if (role) result.role = limit(role, 40)
  const name = element.getAttribute('name')
  if (name) result.name = limit(name, 60)
  const type = element.getAttribute('type')
  if (type) result.type = limit(type, 40)
  if (
    !sensitive(element) &&
    tag !== 'input' &&
    tag !== 'textarea' &&
    tag !== 'select'
  ) {
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim()
    if (text) result.text = limit(text, 120)
  }
  const path: string[] = []
  let current: Element | null = element
  while (current && current !== document.body && path.length < 6) {
    let segment = current.tagName.toLowerCase()
    if ((current as HTMLElement).id)
      segment += `#${limit((current as HTMLElement).id, 40)}`
    path.unshift(segment)
    current = current.parentElement
  }
  result.path = path.join(' > ')
  return result
}

function enabled(value: boolean | { enabled?: boolean } | undefined): boolean {
  return typeof value === 'boolean' ? value : value?.enabled === true
}

const interactiveSelector =
  'a,button,input,select,textarea,summary,[role], [tabindex]'

export function isHeatmapPreview(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.parent !== window &&
    new URLSearchParams(window.location.search).get('ferno_preview') === '1'
  )
}

export class InstrumentationRuntime {
  private options: InstrumentationOptions
  private active = false
  private cleanups: Array<() => void> = []
  private previousUrl = location.href
  private previousPageviewID?: string
  private pageStartedAt = Date.now()
  private clickHistory: Array<{
    x: number
    y: number
    time: number
    element: Element
  }> = []
  private heatmapPoints: Record<string, unknown>[] = []
  private heatmapTimer?: number
  private handlingException = false
  private exceptionCounts = new Map<string, { count: number; start: number }>()

  constructor(
    private track: (
      name: FernoEventName,
      properties: Record<string, unknown>
    ) => void,
    options: InstrumentationOptions = {}
  ) {
    this.options = options
  }

  start(options: InstrumentationOptions = this.options): void {
    this.stop()
    this.options = options
    this.active = true
    if (isHeatmapPreview()) this.setupPreview()
    if (enabled(options.autocapture))
      this.listen(document, 'click', this.captureClick)
    if (enabled(options.rageClicks) || enabled(options.deadClicks)) {
      this.listen(document, 'click', this.observeClick)
      this.listen(document, 'touchend', this.observeClick)
    }
    if (enabled(options.navigation)) this.setupNavigation(options.navigation!)
    if (enabled(options.exceptions)) this.setupExceptions(options.exceptions!)
    if (enabled(options.heatmaps)) this.setupHeatmaps(options.heatmaps!)
  }

  stop(): void {
    this.active = false
    this.cleanups.splice(0).forEach((cleanup) => cleanup())
    if (this.heatmapTimer) window.clearInterval(this.heatmapTimer)
    this.heatmapTimer = undefined
    this.heatmapPoints = []
  }

  startAutocapture() {
    this.options.autocapture = true
    this.start(this.options)
  }
  stopAutocapture() {
    this.options.autocapture = false
    this.start(this.options)
  }
  startRageClicks() {
    this.options.rageClicks = true
    this.start(this.options)
  }
  stopRageClicks() {
    this.options.rageClicks = false
    this.start(this.options)
  }
  startDeadClicks() {
    this.options.deadClicks = true
    this.start(this.options)
  }
  stopDeadClicks() {
    this.options.deadClicks = false
    this.start(this.options)
  }
  startNavigation() {
    this.options.navigation = true
    this.start(this.options)
  }
  stopNavigation() {
    this.options.navigation = false
    this.start(this.options)
  }
  startExceptions() {
    this.options.exceptions = true
    this.start(this.options)
  }
  stopExceptions() {
    this.options.exceptions = false
    this.start(this.options)
  }
  startHeatmaps() {
    this.options.heatmaps = true
    this.start(this.options)
  }
  stopHeatmaps() {
    this.options.heatmaps = false
    this.start(this.options)
  }

  private listen(
    target: EventTarget,
    name: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ) {
    target.addEventListener(name, listener, options)
    this.cleanups.push(() => target.removeEventListener(name, listener, options))
  }

  private captureClick = (event: Event) => {
    const target = (event.target as Element | null)?.closest?.('*') || null
    if (!target) return
    const mouse = event as MouseEvent
    this.track(
      FERNO_EVENT_NAMES.AUTOCAPTURE,
      this.elementProperties(target, mouse.clientX, mouse.clientY)
    )
  }

  private observeClick = (event: Event) => {
    const target = (event.target as Element | null)?.closest?.('*') || null
    if (!target || target.matches(interactiveSelector)) return
    const mouse = event as MouseEvent
    const x = mouse.clientX || 0,
      y = mouse.clientY || 0,
      now = Date.now()
    const rage =
      typeof this.options.rageClicks === 'object' ? this.options.rageClicks : {}
    const count = rage.count ?? 3,
      timeout = rage.timeout ?? 1000,
      distance = rage.distance ?? 30
    this.clickHistory = this.clickHistory.filter(
      (item) => now - item.time <= timeout
    )
    this.clickHistory.push({ x, y, time: now, element: target })
    const matching = this.clickHistory.filter(
      (item) =>
        item.element === target &&
        Math.hypot(item.x - x, item.y - y) <= distance
    )
    if (enabled(this.options.rageClicks) && matching.length >= count) {
      this.track(
        FERNO_EVENT_NAMES.RAGE_CLICK,
        this.elementProperties(target, x, y)
      )
      this.clickHistory = []
    }
    if (enabled(this.options.deadClicks)) {
      const windowMs =
        typeof this.options.deadClicks === 'object'
          ? this.options.deadClicks.observationWindow ?? 300
          : 300
      const before = target.childElementCount
      window.setTimeout(() => {
        if (
          this.active &&
          target.isConnected &&
          target.childElementCount === before
        )
          this.track(
            FERNO_EVENT_NAMES.DEAD_CLICK,
            this.elementProperties(target, x, y)
          )
      }, windowMs)
    }
  }

  private elementProperties(
    element: Element,
    x: number,
    y: number
  ): Record<string, unknown> {
    const rect = element.getBoundingClientRect(),
      docX = x + window.scrollX,
      docY = y + window.scrollY
    return {
      url: location.href,
      normalizedUrl: normalizeEventUrl(location.href),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      coordinates: {
        x,
        y,
        documentX: docX,
        documentY: docY,
        offsetX: x - rect.left,
        offsetY: y - rect.top,
      },
      element: fingerprintElement(element),
    }
  }

  private setupNavigation(
    config: boolean | { enabled?: boolean; hash?: boolean }
  ) {
    const hash = typeof config === 'object' ? config.hash !== false : true
    const originalPush = history.pushState,
      originalReplace = history.replaceState
    const leave = () => {
      const previous = this.previousUrl
      this.track(FERNO_EVENT_NAMES.PAGE_LEAVE, {
        url: previous,
        normalizedUrl: normalizeEventUrl(previous),
        previousPageviewId: this.previousPageviewID,
        previousPathname: new URL(previous).pathname,
        duration: Date.now() - this.pageStartedAt,
        scroll: { x: scrollX, y: scrollY },
        viewport: { width: innerWidth, height: innerHeight },
      })
    }
    const transition = (type: string) => {
      const url = location.href
      if (url === this.previousUrl) return
      leave()
      const previous = this.previousUrl
      this.previousUrl = url
      this.pageStartedAt = Date.now()
      this.track(FERNO_EVENT_NAMES.PAGE_VIEW, {
        url,
        normalizedUrl: normalizeEventUrl(url),
        navigationType: type,
        previousPageviewId: this.previousPageviewID,
        previousPathname: new URL(previous).pathname,
        uTurn: new URL(url).pathname === new URL(previous).pathname,
        viewport: { width: innerWidth, height: innerHeight },
      })
    }
    history.pushState = ((...args: Parameters<History['pushState']>) => {
      const result = originalPush.apply(history, args)
      transition('pushState')
      return result
    }) as History['pushState']
    history.replaceState = ((...args: Parameters<History['replaceState']>) => {
      const result = originalReplace.apply(history, args)
      transition('replaceState')
      return result
    }) as History['replaceState']
    const pop = () => transition('popstate'),
      hashChange = () => transition('hashchange')
    let unloaded = false
    const pagehide = () => {
      if (!unloaded) {
        unloaded = true
        leave()
      }
    }
    this.listen(window, 'popstate', pop)
    if (hash) this.listen(window, 'hashchange', hashChange)
    this.listen(window, 'pagehide', pagehide)
    this.cleanups.push(() => {
      history.pushState = originalPush
      history.replaceState = originalReplace
    })
  }

  private setupExceptions(
    config: boolean | { enabled?: boolean; console?: boolean }
  ) {
    this.listen(window, 'error', ((event: ErrorEvent) =>
      this.captureException(
        event.error || event.message,
        'window.error'
      )) as EventListener)
    this.listen(window, 'unhandledrejection', ((event: PromiseRejectionEvent) =>
      this.captureException(
        event.reason,
        'unhandledrejection'
      )) as EventListener)
    if (typeof config === 'object' && config.console) {
      const original = console.error
      console.error = (...args: unknown[]) => {
        original(...args)
        this.captureException(args[0], 'console.error')
      }
      this.cleanups.push(() => {
        console.error = original
      })
    }
  }

  private captureException(value: unknown, source: string) {
    if (this.handlingException) return
    const error =
      value instanceof Error
        ? value
        : new Error(
            typeof value === 'string'
              ? value
              : (() => {
                  try {
                    return JSON.stringify(value)
                  } catch {
                    return String(value)
                  }
                })()
          )
    const signature = `${error.name}:${error.message}:${error.stack || ''}`,
      now = Date.now(),
      prior = this.exceptionCounts.get(signature)
    if (prior && now - prior.start < 60000 && prior.count >= 5) return
    this.exceptionCounts.set(
      signature,
      prior && now - prior.start < 60000
        ? { count: prior.count + 1, start: prior.start }
        : { count: 1, start: now }
    )
    this.handlingException = true
    try {
      this.track(FERNO_EVENT_NAMES.EXCEPTION, {
        name: error.name,
        message: limit(error.message, 1000),
        stack: limit(error.stack || '', 4000),
        source,
        url: location.href,
        normalizedUrl: normalizeEventUrl(location.href),
        timestamp: new Date(now).toISOString(),
      })
    } finally {
      this.handlingException = false
    }
  }

  private setupHeatmaps(
    config:
      | boolean
      | { enabled?: boolean; flushInterval?: number; maxPoints?: number }
  ) {
    const max = typeof config === 'object' ? config.maxPoints ?? 500 : 500
    const add = (event: Event) => {
      const target = (event.target as Element | null)?.closest?.('*')
      if (!target) return
      const mouse = event as MouseEvent
      const rect = target.getBoundingClientRect()
      this.heatmapPoints.push({
        url: location.href,
        normalizedUrl: normalizeEventUrl(location.href),
        type: 'click',
        x: mouse.clientX,
        y: mouse.clientY,
        documentX: mouse.clientX + scrollX,
        documentY: mouse.clientY + scrollY,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        scrollX,
        scrollY,
        fixed: getComputedStyle(target).position === 'fixed',
        sticky: getComputedStyle(target).position === 'sticky',
        element: fingerprintElement(target),
        offsetX: mouse.clientX - rect.left,
        offsetY: mouse.clientY - rect.top,
        timestamp: new Date().toISOString(),
      })
      if (this.heatmapPoints.length >= max) this.flushHeatmap()
    }
    this.listen(document, 'click', add)
    this.heatmapTimer = window.setInterval(
      () => this.flushHeatmap(),
      typeof config === 'object' ? config.flushInterval ?? 10000 : 10000
    )
    this.listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushHeatmap()
    })
    this.listen(window, 'pagehide', () => this.flushHeatmap())
  }
  private flushHeatmap() {
    if (this.heatmapPoints.length) {
      const points = this.heatmapPoints.splice(0)
      this.track(FERNO_EVENT_NAMES.HEATMAP, { points })
    }
  }

  private setupPreview() {
    const blockInteraction = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null
      const interactive = target ? target.closest(interactiveSelector) : null
      const isActivation =
        event.type === 'click' ||
        event.type === 'auxclick' ||
        event.type === 'submit'
      const isPointerActivation =
        interactive && (event.type === 'mousedown' || event.type === 'pointerdown')
      const isKeyboardActivation =
        interactive &&
        event.type === 'keydown' &&
        ((event as KeyboardEvent).key === 'Enter' ||
          (event as KeyboardEvent).key === ' ')
      if (!isActivation && !isPointerActivation && !isKeyboardActivation) return
      event.preventDefault()
      event.stopPropagation()
    }
    ;['click', 'auxclick', 'submit', 'mousedown', 'pointerdown', 'keydown'].forEach(
      (name) => this.listen(window, name, blockInteraction, true)
    )

    const params = new URLSearchParams(location.search)
    if (params.get('ferno_preview') !== '1' || window.parent === window) return
    const nonce = params.get('ferno_nonce'),
      project = params.get('ferno_project'),
      expectedOrigin = params.get('ferno_origin')
    if (!nonce || !project || !expectedOrigin) return
    const previewURL = new URL(location.href)
    ;['ferno_preview', 'ferno_nonce', 'ferno_project', 'ferno_origin'].forEach(
      (key) => previewURL.searchParams.delete(key)
    )
    const normalizedURL = previewURL.href
    let canvas: HTMLCanvasElement | undefined
    let previewPoints: Array<Record<string, unknown>> = []
    const draw = (points: Array<Record<string, unknown>>) => {
      previewPoints = points
      canvas ??= document.createElement('canvas')
      canvas.width = innerWidth
      canvas.height = innerHeight
      Object.assign(canvas.style, {
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: '2147483647',
      })
      if (!canvas.parentNode) document.documentElement.appendChild(canvas)
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.globalCompositeOperation = 'lighter'
      points.forEach((point) => {
        const fixed = point.fixed === true
        const x =
          Number(fixed ? point.x : point.documentX) - (fixed ? 0 : scrollX)
        const y =
          Number(fixed ? point.y : point.documentY) - (fixed ? 0 : scrollY)
        const count = Number(point.count || 1)
        const radius = Math.min(48, 14 + Math.log2(count + 1) * 8)
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius)
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.45)')
        gradient.addColorStop(0.35, 'rgba(251, 191, 36, 0.3)')
        gradient.addColorStop(0.72, 'rgba(34, 197, 94, 0.12)')
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0)')
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fillStyle = gradient
        context.fill()
      })
      context.globalCompositeOperation = 'source-over'
    }
    const sendReady = () => {
      window.parent.postMessage(
        { type: 'ferno_preview_ready', nonce, project, url: normalizedURL },
        expectedOrigin
      )
    }
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (
        event.source !== window.parent ||
        event.origin !== expectedOrigin ||
        !data ||
        data.nonce !== nonce ||
        data.project !== project ||
        data.url !== normalizedURL
      )
        return
      if (data.type === 'ferno_preview_ping') {
        sendReady()
        return
      }
      if (data.type !== 'ferno_heatmap_points' || !Array.isArray(data.points))
        return
      draw(data.points as Array<Record<string, unknown>>)
    }
    this.listen(window, 'message', receive as EventListener)
    this.listen(window, 'scroll', () => draw(previewPoints))
    this.listen(window, 'resize', () => draw(previewPoints))
    this.cleanups.push(() => {
      canvas?.remove()
    })
    sendReady()
  }
}
