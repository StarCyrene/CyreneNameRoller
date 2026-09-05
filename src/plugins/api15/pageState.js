const ORDINARY_FIELDS = new Set(['language', 'theme', 'animation', 'display', 'drawFilter'])
const SENSITIVE_CONFIRMATIONS = new Map([
  ['clearHistory', 'clear-history'], ['manageLists', 'manage-lists'], ['importExport', 'import-export'], ['fairness', 'fairness-settings'], ['windowSecurity', 'window-security']
])

export class PageStateBridge {
  constructor({ pluginId = '', state = {}, permissions = [], confirm } = {}) {
    this.pluginId = pluginId
    this.state = state
    this.permissions = new Set(permissions)
    this.confirm = confirm
  }

  read(field) {
    if (!ORDINARY_FIELDS.has(field) && !SENSITIVE_CONFIRMATIONS.has(field)) throw new Error('state field is not exposed')
    return this.state[field]
  }

  async write(field, value, { confirmationId } = {}) {
    if (ORDINARY_FIELDS.has(field)) { this.state[field] = value; return value }
    const expected = SENSITIVE_CONFIRMATIONS.get(field)
    if (!this.permissions.has('page:write-sensitive')) throw Object.assign(new Error('plugin permission denied'), { code: 'PLUGIN_PERMISSION_DENIED' })
    if (confirmationId !== expected || typeof this.confirm !== 'function' || (await this.confirm(confirmationId, this.pluginId)) !== true) throw new Error('confirmation required')
    this.state[field] = value
    return value
  }
}
