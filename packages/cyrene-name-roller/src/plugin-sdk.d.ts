export declare const PLUGIN_API_VERSION: '1.4.0'
export declare const PluginEvents: {
  readonly APP_READY: 'app:ready'
  readonly APP_ROUTE_CHANGED: 'app:route-changed'
  readonly APP_THEME_CHANGED: 'app:theme-changed'
  readonly APP_RESIZE: 'app:resize'
  readonly PLUGIN_STORAGE_CHANGED: 'plugin:storage-changed'
  readonly DRAW_ITEM_RESULT: 'draw:item-result'
  readonly DRAW_RESULT: 'draw:result'
  readonly ROLLER_START: 'roller:start'
  readonly ROLLER_ITEM_RESULT: 'roller:item-result'
  readonly ROLLER_RESULT: 'roller:result'
  readonly CARD_ITEM_RESULT: 'card:item-result'
  readonly CARD_RESULT: 'card:result'
  readonly LOTTERY_RESULT: 'lottery:result'
  readonly LOTTERY_ITEM_RESULT: 'lottery:item-result'
  readonly LOTTERY_ASSIGN_RESULT: 'lottery:assign-result'
}
export declare const PluginPermissions: {
  readonly STORAGE_READ: 'storage:read'
  readonly STORAGE_WRITE: 'storage:write'
  readonly EVENTS_DRAW: 'events:draw'
  readonly NOTIFICATIONS_SHOW: 'notifications:show'
  readonly AUDIO_SELECT: 'audio:select'
  readonly AUDIO_PLAY: 'audio:play'
  readonly NAMES_READ: 'names:read'
  readonly RECORDS_READ: 'records:read'
  readonly STATISTICS_READ: 'statistics:read'
  readonly BALANCE_READ: 'balance:read'
  readonly EVENTS_LIFECYCLE: 'events:lifecycle'
  readonly DRAW_EXECUTE: 'draw:execute'
  readonly UI_ANIMATIONS: 'ui:animations'
  readonly UI_VISUAL_SURFACES: 'ui:visual-surfaces'
  readonly UI_APPEARANCE: 'ui:appearance'
  readonly UI_COMPONENT_STYLES: 'ui:component-styles'
  readonly UI_COMPONENT_OVERRIDES: 'ui:component-overrides'
  readonly UI_NATIVE_VIEWS: 'ui:native-views'
  readonly UI_RESULT_PRESENTATIONS: 'ui:result-presentations'
  readonly UI_FONTS: 'ui:fonts'
  readonly SYSTEM_OPEN_URL: 'system:open-url'
  readonly SYSTEM_SELECT_FILE: 'system:select-file'
  readonly SYSTEM_SELECT_DIRECTORY: 'system:select-directory'
  readonly SYSTEM_CLIPBOARD_READ: 'system:clipboard-read'
  readonly SYSTEM_CLIPBOARD_WRITE: 'system:clipboard-write'
  readonly SYSTEM_REVEAL_FILE: 'system:reveal-file'
  readonly SYSTEM_EXECUTE: 'system:execute'
}

export declare const AnimationTargets: {
  readonly PAGE_TRANSITION: 'page.transition'
  readonly ROLLER_FINISH: 'roller.finish'
  readonly CARD_DEAL: 'card.deal'
  readonly CARD_FLIP: 'card.flip'
  readonly LOTTERY_FINISH: 'lottery.finish'
  readonly GLOBAL_TRANSITION: 'global.transition'
}

export declare const PluginPageLocations: {
  readonly PLUGINS: 'plugins'
  readonly DOCK: 'dock'
}

export declare const PluginCommandLocations: {
  readonly COMMAND_PALETTE: 'command-palette'
  readonly PAGE_HEADER: 'page-header'
  readonly CONTEXT_MENU: 'context-menu'
}

export declare const PluginPlatforms: {
  readonly WEB: 'web'
  readonly TAURI: 'tauri'
  readonly WINDOWS: 'windows'
  readonly MACOS: 'macos'
  readonly LINUX: 'linux'
  readonly ANDROID: 'android'
  readonly IOS: 'ios'
}

export declare const PluginCapabilities: {
  readonly NOTIFICATIONS_SHOW: 'notifications:show'
  readonly AUDIO_SELECT: 'audio:select'
  readonly AUDIO_PLAY: 'audio:play'
  readonly OPEN_URL: 'system:open-url'
  readonly SELECT_FILE: 'system:select-file'
  readonly SELECT_DIRECTORY: 'system:select-directory'
  readonly CLIPBOARD_READ: 'system:clipboard-read'
  readonly CLIPBOARD_WRITE: 'system:clipboard-write'
  readonly REVEAL_FILE: 'system:reveal-file'
  readonly EXECUTE: 'system:execute'
}

export interface PluginPlatform {
  runtime: 'web' | 'tauri'
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'
  desktop: boolean
}

export interface CapabilityStatus {
  id: string
  label: string
  available: boolean
  code: string
  platform: 'web' | 'tauri'
  os: PluginPlatform['os']
}

export interface CapabilityResult<T = unknown> {
  ok: boolean
  capability: string
  platform: 'web' | 'tauri'
  os: PluginPlatform['os']
  value: T | null
  code?: string
  message?: string
  cancelled?: boolean
}

export interface HostExtensionCapability {
  id: string
  permission: PluginPermission
  available: boolean
  description: string
  access?: 'read-only'
  mode?: 'host-owned'
  appendOnly?: boolean
}

export interface HostExtensionDescriptor {
  schemaVersion: 1
  apiVersion: string
  model: 'product-freedom-core-hosted'
  platform?: 'web' | 'tauri'
  security?: { runtime: 'plugin-isolated' | 'backend-authoritative' }
  componentTargets?: Array<{
    id: string
    platform?: 'all' | 'web' | 'tauri'
    available: boolean
    visibilityPolicy: 'protected' | 'required' | 'replaceable' | 'optional'
    allowedStyles: readonly string[]
    allowPluginFonts?: boolean
  }>
  slots?: Array<{
    id: `slot:${string}`
    available: boolean
    platform: 'web' | 'tauri'
  }>
  resources: HostExtensionCapability[]
  transactions: HostExtensionCapability[]
  contributions: string[]
  extensionPoints: {
    pages: { ownership: 'plugin'; surface: 'isolated-document'; locations: Array<'plugins' | 'dock'> }
    commands: { ownership: 'plugin'; invocation: 'host-brokered'; locations: Array<'command-palette' | 'page-header' | 'context-menu'> }
    animationPacks: { ownership: 'host'; execution: Array<'gsap' | 'waapi'>; input: 'declarative' }
    visualSurfaces: { ownership: 'plugin'; surface: 'offscreen-canvas'; placement: Array<'background'> }
    appearancePacks: { ownership: 'host'; input: 'semantic-tokens'; modes: Array<'light' | 'dark'> }
    fonts: { ownership: 'host'; input: 'validated-woff2'; namespace: 'plugin:<pluginId>/<fontId>' }
    nativeViews: { ownership: 'host'; input: 'declarative-schema'; slots: Array<'slot:roller.side-panel' | 'slot:roller.below-result' | 'slot:records.toolbar'> }
    componentStylePacks: { ownership: 'host'; input: 'stable-component-ids'; properties: readonly string[] }
    componentOverridePacks: { ownership: 'host'; input: 'stable-component-ids'; visibility: readonly string[] }
    resultPresentations: { ownership: 'host'; input: 'verified-receipt-context'; targets: Array<'roller.result'> }
  }
  guarantees: {
    existingRecordsImmutable: true
    statisticsImmutable: true
    balanceParametersImmutable: true
    resultSelectionHostOwned: true
  }
}

export interface PluginContext {
  plugin: { id: string; version: string }
  permissions: readonly PluginPermission[]
  platform: PluginPlatform
  capabilities: Record<string, CapabilityStatus>
  host: HostExtensionDescriptor
  request(method: string, args?: Record<string, unknown>): Promise<any>
}

export interface PluginModule {
  activate(context: PluginContext): void | Promise<void>
  onEvent?(event: string, payload: unknown): void | Promise<void>
  onCommand?(commandId: string, args: unknown): unknown | Promise<unknown>
  deactivate?(): void | Promise<void>
}

export type AnimationTarget = typeof AnimationTargets[keyof typeof AnimationTargets]
export type PluginPermission = typeof PluginPermissions[keyof typeof PluginPermissions]
export type PluginPlatformId = PluginPlatform['runtime'] | Exclude<PluginPlatform['os'], 'unknown'>
export type PluginEvent = typeof PluginEvents[keyof typeof PluginEvents]

export type PluginAnimationProperty =
  | 'opacity' | 'transform' | 'filter' | 'clipPath' | 'borderRadius'
  | 'boxShadow' | 'textShadow' | 'color' | 'background' | 'backgroundColor'
  | 'letterSpacing' | 'offset' | 'easing' | 'composite'

export type PluginAnimationKeyframe =
  Partial<Record<Exclude<PluginAnimationProperty, 'offset' | 'composite'>, string | number>> & {
    offset?: number
    composite?: 'replace' | 'add' | 'accumulate'
  }

export interface PluginWaapiAnimationDefinition {
  keyframes: PluginAnimationKeyframe[]
  options: {
    duration: number
    delay?: number
    easing?: string
    iterations?: number
    direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
  }
}

export type PluginGsapProperty =
  | 'opacity' | 'autoAlpha' | 'x' | 'y' | 'xPercent' | 'yPercent'
  | 'scale' | 'scaleX' | 'scaleY' | 'rotation' | 'rotate'
  | 'rotationX' | 'rotationY' | 'rotateX' | 'rotateY' | 'skewX' | 'skewY'
  | 'filter' | 'clipPath' | 'borderRadius' | 'boxShadow' | 'textShadow'
  | 'color' | 'background' | 'backgroundColor' | 'letterSpacing' | 'transformOrigin'

export type PluginGsapVars = Partial<Record<PluginGsapProperty, string | number | boolean>>

export interface PluginGsapAnimationDefinition {
  gsap: {
    from: PluginGsapVars
    to: PluginGsapVars
    options: {
      duration: number
      delay?: number
      ease?: string
      repeat?: number
      yoyo?: boolean
    }
  }
}

export type PluginAnimationDefinition = PluginWaapiAnimationDefinition | PluginGsapAnimationDefinition

export interface PluginAnimationPreset {
  id: string
  target: AnimationTarget
  label: string
  description?: string
  tags?: string[]
  default?: boolean
  animation?: PluginAnimationDefinition
  variants?: Record<string, PluginAnimationDefinition>
}

export interface PluginAnimationPack {
  schemaVersion: 1
  title?: string
  description?: string
  presets: PluginAnimationPreset[]
}

export interface PluginAnimationPackContribution {
  id: string
  title: string
  description?: string
  source: string
}

export type PluginAppearanceToken =
  | '--accent' | '--accent-light' | '--accent-dark' | '--accent-hover' | '--accent-200' | '--accent-50' | '--text-on-accent'
  | '--bg-base' | '--bg-card' | '--bg-card-solid' | '--bg-hover' | '--bg-acrylic' | '--bg-mica'
  | '--text-primary' | '--text-secondary' | '--text-muted'
  | '--border-default' | '--border-subtle' | '--border-strong'
  | '--shadow-2' | '--shadow-4' | '--shadow-8' | '--shadow-16'

export type PluginAppearanceTokens = Partial<Record<PluginAppearanceToken, string>>

export interface PluginAppearancePackContribution {
  id: string
  title: string
  titleEn?: string
  description?: string
  base?: 'peach' | 'fluent'
  light?: PluginAppearanceTokens
  dark?: PluginAppearanceTokens
}

export interface PluginNativeControlBase {
  id: string
  label: string
  description?: string
}

export interface PluginToggleControl extends PluginNativeControlBase {
  type: 'toggle'
  path: string
  default?: boolean
}

export interface PluginRangeControl extends PluginNativeControlBase {
  type: 'range'
  path: string
  min: number
  max: number
  step?: number
  default?: number
}

export interface PluginSelectControl extends PluginNativeControlBase {
  type: 'select'
  path: string
  options: Array<{ value: string; label: string }>
  default?: string
}

export interface PluginAudioControl extends PluginNativeControlBase {
  type: 'audio'
  path: string
  accept?: string
  default?: null
}

export interface PluginAnimationSelectControl extends PluginNativeControlBase {
  type: 'animation-select'
  target: AnimationTarget
  packId?: string
}

export interface PluginComponentStyleSelectControl extends PluginNativeControlBase {
  type: 'component-style-select'
  target: string
}

export interface PluginComponentOverrideSelectControl extends PluginNativeControlBase {
  type: 'component-override-select'
  target: string
}

export interface PluginComponentOverrideToggleControl extends PluginNativeControlBase {
  type: 'component-override-toggle'
  target: string
  packId: string
}

export interface PluginResultPresentationSelectControl extends PluginNativeControlBase {
  type: 'result-presentation-select'
  target: 'roller.result'
}

export type PluginNativeControl =
  | PluginToggleControl | PluginRangeControl | PluginSelectControl
  | PluginAudioControl | PluginAnimationSelectControl
  | PluginComponentStyleSelectControl | PluginComponentOverrideSelectControl | PluginComponentOverrideToggleControl
  | PluginResultPresentationSelectControl

export interface PluginNativeSettingsPage {
  type: 'settings'
  settingsKey?: string
  controls: PluginNativeControl[]
}

export interface PluginPageContribution {
  id: string
  title: string
  titleEn?: string
  icon?: string
  location?: 'plugins' | 'dock'
  order?: number
  entry?: string
  platformEntries?: Partial<Record<PluginPlatformId, string>>
  native?: PluginNativeSettingsPage
}

export type PluginCommandLocation = 'command-palette' | 'page-header' | 'context-menu'

export interface PluginCommandContribution {
  id: string
  title: string
  titleEn?: string
  description?: string
  icon?: string
  locations?: PluginCommandLocation[]
  order?: number
}

export interface PluginVisualSurfaceContribution {
  id: string
  title?: string
  entry?: string
  platformEntries?: Partial<Record<PluginPlatformId, string>>
  placement?: 'background'
  events?: string[]
  defaultEnabled?: boolean
}

export interface PluginDependency {
  id: string
  range?: string
  version?: string
  dataAccess?: boolean
}

export interface PluginCapabilityDeclaration {
  required?: boolean
  platforms?: PluginPlatformId[]
}

export interface PluginSystemOperation {
  id: string
  label: string
  platforms?: PluginPlatformId[]
  command: { program: string; args?: string[] }
  timeoutMs?: number
}

export interface PluginManifest {
  schemaVersion: 1
  id: string
  name: string
  version: string
  author: string
  description?: string
  engine: { min: string; max?: string }
  entry?: string
  platformEntries?: Partial<Record<PluginPlatformId, string>>
  supportedPlatforms?: PluginPlatformId[]
  icon?: string
  readme?: string
  permissions?: PluginPermission[]
  capabilities?: Partial<Record<string, PluginCapabilityDeclaration>>
  systemOperations?: PluginSystemOperation[]
  dependencies?: PluginDependency[]
  shareData?: boolean
  contributes?: {
    pages?: PluginPageContribution[]
    commands?: PluginCommandContribution[]
    animationPacks?: PluginAnimationPackContribution[]
    visualSurfaces?: PluginVisualSurfaceContribution[]
    appearancePacks?: PluginAppearancePackContribution[]
    componentStylePacks?: PluginComponentStylePackContribution[]
    componentOverridePacks?: PluginComponentOverridePackContribution[]
    nativeViews?: PluginNativeViewContribution[]
    resultPresentations?: PluginResultPresentationContribution[]
    fonts?: PluginFontContribution[]
  }
}

export type ComponentStyleProperty = 'size' | 'scale' | 'foreground' | 'background' | 'accent' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight' | 'padding' | 'gap' | 'radius' | 'borderColor' | 'borderWidth' | 'shadow' | 'alignment' | 'density'
export interface PluginComponentStylePackContribution { id: string; title: string; description?: string; targets: Record<string, Partial<Record<ComponentStyleProperty, string | number>>> }
export interface PluginComponentOverridePackContribution { id: string; title: string; description?: string; targets: Record<string, { visibility?: 'visible' | 'hidden' | 'replaced'; layout?: 'collapse' | 'reserve' | 'compact' }> }
export interface PluginNativeViewContribution { id: string; title: string; titleEn?: string; description?: string; slot: 'slot:roller.side-panel' | 'slot:roller.below-result' | 'slot:records.toolbar'; source: string; uses?: PluginPermission[]; order?: number }
export interface PluginResultPresentationContribution { id: string; title: string; titleEn?: string; description?: string; targets: Array<'roller.result'>; layout: 'single' | 'list' | 'grid' | 'spotlight'; style?: { size?: 'small' | 'medium' | 'large'; alignment?: 'start' | 'center' | 'end'; showAlgorithm?: boolean; showOperationId?: boolean; showEnglishName?: boolean } }
export interface PluginFontContribution { id: string; source: string; weight?: 400 | 500 | 600 | 700 | 800; style?: 'normal' | 'italic' }

export interface DrawRequest {
  listId?: string
  target?: 'people' | 'groups'
  count?: number
  gender?: 'all' | 'male' | 'female'
  allowDuplicates?: boolean
}

export interface DrawResultItem {
  readonly id: string
  readonly name: string
  readonly englishName: string
  readonly isGroup: boolean
  readonly isWhiteList: boolean
}

export interface DrawReceipt {
  readonly operationId: string
  readonly pluginId: string
  readonly listId: string
  readonly target: 'people' | 'groups'
  readonly count: number
  readonly allowDuplicates: boolean
  readonly gender: 'all' | 'male' | 'female'
  readonly algorithm: string
  readonly algorithmVersion: string
  readonly committedAt: number
  readonly sequence?: number
  readonly previousHash?: string
  readonly receiptHash?: string
  readonly results: readonly DrawResultItem[]
}

export interface VisualSurfaceContext extends PluginContext {
  canvas: OffscreenCanvas
  surface: Readonly<{ id: string; placement: 'background' }>
}

export interface VisualSurfaceModule {
  activate(context: VisualSurfaceContext): void | Promise<void>
  onResize?(viewport: Readonly<{ width: number; height: number; dpr: number; pixelWidth: number; pixelHeight: number }>): void | Promise<void>
  onEvent?(event: string, payload: unknown): void | Promise<void>
  deactivate?(): void | Promise<void>
}

export interface ReadonlyNamesSnapshot {
  readonly currentListId: string
  readonly lists: Readonly<Record<string, unknown>>
}

export type ReadonlyRecordsSnapshot = ReadonlyArray<Readonly<{
  personId: string | null
  listId: string | null
  groupId?: string | null
  source?: string
  operationId?: string
  pluginId?: string
  time?: number
}>>

export interface ReadonlyStatisticsSnapshot {
  readonly counts: Readonly<Record<string, number>>
  readonly totalCount: number
}

export interface ReadonlyBalanceSnapshot {
  readonly enabled: boolean
  readonly algorithm: string
  readonly version: string
  readonly targetGap: number
  readonly defaults: Readonly<Record<string, unknown>>
}

export declare function definePlugin<T extends PluginModule>(plugin: T): T
export declare function defineVisualSurface<T extends VisualSurfaceModule>(surface: T): T
export declare function createRequest(context: PluginContext): PluginContext['request']
export declare function getPlatform(context: PluginContext): Promise<PluginPlatform>
export declare function getCapabilities(context: PluginContext): Promise<Record<string, CapabilityStatus>>
export declare function describeHost(context: PluginContext): Promise<HostExtensionDescriptor>
export declare function queryResource<T = unknown>(context: PluginContext, resource: string, query?: Record<string, unknown>): Promise<T>
export declare function executeTransaction<T = unknown>(context: PluginContext, transaction: string, input?: Record<string, unknown>): Promise<T>
export declare function isCapabilityAvailable(context: PluginContext, capability: string): Promise<boolean>
export declare function requestCapability<T = unknown>(context: PluginContext, method: string, args?: Record<string, unknown>, options?: { ignoreUnsupported?: boolean }): Promise<CapabilityResult<T>>
export declare function executeDraw(context: PluginContext, options?: DrawRequest): Promise<DrawReceipt>
export declare function readDependencyStorage<T = unknown>(context: PluginContext, pluginId: string, key: string): Promise<T>
export declare function withPlatform<T = unknown>(context: PluginContext, handlers: Partial<Record<PluginPlatform['runtime'] | PluginPlatform['os'] | 'default', (platform: PluginPlatform) => T | Promise<T>>>): Promise<T | undefined>
export declare function eventIs(event: string, type: string): boolean
export declare function isResultEvent(event: string): boolean
