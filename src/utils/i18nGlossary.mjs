// Exact interface phrases, applied before cache and machine translation.
// The short/Vue variants must match the labels used in menus and toolbars.
const RUSSIAN = [
  [['随机点名', 'Random roll call', 'Random name picker'], 'Случайный выбор из списка'],
  [['点名', 'Roll call'], 'Перекличка'],
  [['点名工具', 'Roll call tools'], 'Инструменты переклички'],
  [['滚动点名', '滚动', 'Roller'], 'Прокрутка имён'],
  [['翻牌点名', '翻牌', 'Card Mode', 'Cards'], 'Карточки с именами'],
  [['转盘点名', '转盘', 'Name wheel', 'Wheel'], 'Колесо имён'],
  [['光轨穿梭', 'Light Tunnel', 'LIGHT TUNNEL'], 'Световой туннель'],
  [['座次寻光', 'Seat Spotlight', 'Seat spotlight'], 'Выбор по местам'],
  [['流萤传灯', 'Firefly Relay'], 'Эстафета светлячков'],
  [['花笺藏名', 'Petal Riddle'], 'Загадка с лепестками'],
  [['连星成诗', 'Constellations'], 'Созвездия'],
  [['谁来点亮？', 'Who goes first?'], 'Кто зажжёт фонарь?'],
  [['第一盏灯', 'Before the first light'], 'Первый фонарь'],
  [['下一站，是谁？', 'Who arrives next?'], 'Кто прибудет следующим?'],
  [['当前名单', 'Name list', 'Current list'], 'Текущий список'],
  [['点名范围', 'Include'], 'Участники'],
  [['转动转盘', 'Spin the wheel'], 'Вращать колесо'],
  [['开始点名', 'Start roll call'], 'Начать перекличку'],
  [['人员名单', 'People list'], 'Список участников'],
  [['抽奖', 'Lottery', 'Prize draw'], 'Розыгрыш призов'],
  [['奖品抽取'], 'Розыгрыш призов'],
  [['奖品单', '当前奖品单', 'Current prize list', 'Prize list'], 'Список призов'],
  [['界面语言', 'Interface language', 'Language'], 'Язык интерфейса'],
  [['清除缓存', '清除翻译缓存', 'Clear cache', 'Clear translation cache'], 'Очистить кеш перевода']
]

const LOCALES = {
  japanese: ['点呼', '点呼ツール', '名簿からランダムに選ぶ'],
  korean: ['출석 확인', '출석 도구', '명단에서 무작위 선택'],
  chinese_traditional: ['點名', '點名工具', '隨機點名'],
  french: ['Appel', 'Outils d’appel', 'Tirage au sort dans la liste'],
  deutsch: ['Namensaufruf', 'Werkzeuge zum Namensaufruf', 'Zufallsauswahl aus der Liste'],
  spanish: ['Pase de lista', 'Herramientas para pasar lista', 'Selección aleatoria de la lista'],
  portuguese: ['Chamada', 'Ferramentas de chamada', 'Seleção aleatória da lista'],
  italian: ['Appello', 'Strumenti per l’appello', 'Estrazione casuale dall’elenco'],
  vietnamese: ['Điểm danh', 'Công cụ điểm danh', 'Chọn ngẫu nhiên từ danh sách']
}
const keyGroups = [['点名', 'Roll call'], ['点名工具', 'Roll call tools'], ['随机点名', 'Random name picker', 'Random roll call']]
const dictionary = Object.fromEntries(Object.entries(LOCALES).map(([locale, values]) =>
  [locale, new Map(keyGroups.flatMap((keys, i) => keys.map(key => [key, values[i]])))]
))
dictionary.russian = new Map(RUSSIAN.flatMap(([keys, value]) => keys.map(key => [key, value])))

export function exactUiTranslation(locale, text) {
  const match = String(text ?? '').match(/^(\s*)(.*?)(\s*)$/s)
  if (!match) return null
  const [, before, label, after] = match
  const value = dictionary[locale]?.get(label)
  return !value ? null : before + value + after
}
