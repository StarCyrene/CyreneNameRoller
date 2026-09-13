export const PAGE_STATE_FIELDS = Object.freeze({ language: 'ordinary', theme: 'ordinary', animation: 'ordinary', display: 'ordinary', drawFilter: 'ordinary', clearHistory: 'sensitive', manageLists: 'sensitive', importExport: 'sensitive', fairness: 'sensitive', windowSecurity: 'sensitive' })
const ORDINARY_FIELDS = new Set(Object.keys(PAGE_STATE_FIELDS).filter(field => PAGE_STATE_FIELDS[field] === 'ordinary'))
const SENSITIVE_CONFIRMATIONS = new Map([
  ['clearHistory', 'clear-history'], ['manageLists', 'manage-lists'], ['importExport', 'import-export'], ['fairness', 'fairness-settings'], ['windowSecurity', 'window-security']
])

export class PageStateBridge {
  constructor({ pluginId = '', state = {}, adapter = null, permissions = [], confirm } = {}) {
    this.pluginId = pluginId
    this.state = state
    this.adapter = adapter || { read: field => this.state[field], write: (field, value) => { this.state[field] = value; return value } }
    this.permissions = new Set(permissions)
    this.confirm = confirm
  }

  read(field) {
    if (!ORDINARY_FIELDS.has(field) && !SENSITIVE_CONFIRMATIONS.has(field)) throw new Error('state field is not exposed')
    return this.adapter.read(field)
  }

  async write(field, value, { confirmationId } = {}) {
    if (ORDINARY_FIELDS.has(field)) return this.adapter.write(field, value)
    const expected = SENSITIVE_CONFIRMATIONS.get(field)
    if (!this.permissions.has('page:write-sensitive')) throw Object.assign(new Error('plugin permission denied'), { code: 'PLUGIN_PERMISSION_DENIED' })
    if (confirmationId !== expected || typeof this.confirm !== 'function' || (await this.confirm(confirmationId, this.pluginId)) !== true) throw new Error('confirmation required')
    return this.adapter.write(field, value)
  }
}
