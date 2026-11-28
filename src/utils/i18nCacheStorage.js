import { dataBridge } from './dataBridge'
import { i18nCacheKey } from './i18nCache'

export function createPersistentTranslationCacheStorage(target) {
  const key = i18nCacheKey(target)
  return {
    load: () => dataBridge.load(key),
    save: payload => dataBridge.save(key, payload),
    remove: () => dataBridge.remove(key)
  }
}
