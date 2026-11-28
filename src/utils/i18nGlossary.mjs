// Core terms have the same coverage in every automatic language. Aliases
// include full, compact and accessible labels from both built-in languages.
const keys = {
  random: ['随机点名', 'Random roll call', 'Random name picker'],
  rollCall: ['点名', 'Roll call'],
  tools: ['点名工具', 'Roll call tools'],
  title: ['点名器', 'Name Roller'],
  roller: ['滚动点名', '滚动', 'Roller'],
  cards: ['翻牌点名', '翻牌', 'Card Mode', 'Cards'],
  wheel: ['转盘点名', '转盘', 'Name wheel', 'Wheel'],
  tunnel: ['光轨穿梭', 'Light Tunnel', 'LIGHT TUNNEL'],
  seats: ['座次寻光', 'Seat Spotlight', 'Seat spotlight'],
  relay: ['流萤传灯', 'Firefly Relay'],
  riddle: ['花笺藏名', 'Petal Riddle'],
  teams: ['连星成诗', 'Constellations'],
  relayPrompt: ['谁来点亮？', 'Who goes first?'],
  firstLight: ['第一盏灯', 'Before the first light'],
  tunnelPrompt: ['下一站，是谁？', 'Who arrives next?'],
  roster: ['当前名单', 'Name list', 'Current list', 'Current List'],
  scope: ['点名范围', 'Include'],
  spin: ['转动转盘', 'Spin the wheel'],
  start: ['开始点名', 'Start roll call'],
  people: ['人员名单', 'People list'],
  lottery: ['抽奖', '抽奖模式', '奖品抽取', 'Lottery', 'Prize draw'],
  prizeList: ['奖品单', '当前奖品单', 'Current prize list', 'Prize list'],
  language: ['界面语言', 'Interface language', 'Language'],
  cache: ['清除缓存', '清除翻译缓存', 'Clear cache', 'Clear translation cache'],
  englishNames: ['English Mode'],
}

const terms = {
  japanese: {
    random: '名簿から無作為に選ぶ', rollCall: '点呼', tools: '点呼ツール', title: '名前抽選',
    roller: '名前スクロール', cards: '名前カード', wheel: '名前ルーレット', tunnel: '光のトンネル',
    seats: '座席から選ぶ', relay: 'ホタルのリレー', riddle: '花びらの謎', teams: '星座',
    relayPrompt: '誰が最初の灯りをともす？', firstLight: '最初の灯り', tunnelPrompt: '次に到着するのは誰？',
    roster: '現在の名簿', scope: '選ぶ対象', spin: 'ルーレットを回す', start: '点呼を始める', people: '参加者名簿',
    lottery: '景品抽選', prizeList: '景品一覧', language: '表示言語', cache: '翻訳キャッシュを消去', englishNames: '英語名を使う',
  },
  korean: {
    random: '명단에서 무작위로 뽑기', rollCall: '호명', tools: '호명 도구', title: '이름 뽑기',
    roller: '이름 스크롤', cards: '이름 카드', wheel: '이름 룰렛', tunnel: '빛의 터널',
    seats: '좌석에서 뽑기', relay: '반딧불이 릴레이', riddle: '꽃잎 수수께끼', teams: '별자리',
    relayPrompt: '누가 첫 등불을 밝힐까요?', firstLight: '첫 등불', tunnelPrompt: '다음에는 누가 도착할까요?',
    roster: '현재 명단', scope: '추첨 대상', spin: '룰렛 돌리기', start: '호명 시작', people: '참가자 명단',
    lottery: '경품 추첨', prizeList: '경품 목록', language: '화면 언어', cache: '번역 캐시 지우기', englishNames: '영어 이름 사용',
  },
  chinese_traditional: {
    random: '隨機點名', rollCall: '點名', tools: '點名工具', title: '點名器',
    roller: '滾動點名', cards: '翻牌點名', wheel: '轉盤點名', tunnel: '光軌穿梭',
    seats: '座次尋光', relay: '流螢傳燈', riddle: '花箋藏名', teams: '連星成詩',
    relayPrompt: '誰來點亮？', firstLight: '第一盞燈', tunnelPrompt: '下一站，是誰？',
    roster: '目前名單', scope: '點名範圍', spin: '轉動轉盤', start: '開始點名', people: '人員名單',
    lottery: '抽獎', prizeList: '獎品清單', language: '介面語言', cache: '清除翻譯快取', englishNames: '使用英文名',
  },
  french: {
    random: 'Tirage au sort dans la liste', rollCall: 'Appel', tools: 'Outils d’appel', title: 'Tirage de noms',
    roller: 'Défilement des noms', cards: 'Cartes de noms', wheel: 'Roue des noms', tunnel: 'Tunnel de lumière',
    seats: 'Tirage par siège', relay: 'Relais des lucioles', riddle: 'Énigme des pétales', teams: 'Constellations',
    relayPrompt: 'Qui allumera la première lanterne ?', firstLight: 'La première lanterne', tunnelPrompt: 'Qui arrivera ensuite ?',
    roster: 'Liste actuelle', scope: 'Participants', spin: 'Faire tourner la roue', start: 'Commencer l’appel', people: 'Liste des participants',
    lottery: 'Tirage de lots', prizeList: 'Liste des lots', language: 'Langue de l’interface', cache: 'Vider le cache de traduction', englishNames: 'Utiliser les noms anglais',
  },
  deutsch: {
    random: 'Zufallsauswahl aus der Liste', rollCall: 'Namensaufruf', tools: 'Werkzeuge zum Namensaufruf', title: 'Namensauslosung',
    roller: 'Namenslauf', cards: 'Namenskarten', wheel: 'Namensrad', tunnel: 'Lichttunnel',
    seats: 'Auswahl nach Sitzplatz', relay: 'Glühwürmchenstaffel', riddle: 'Blütenrätsel', teams: 'Sternbilder',
    relayPrompt: 'Wer zündet die erste Laterne an?', firstLight: 'Die erste Laterne', tunnelPrompt: 'Wer kommt als Nächstes an?',
    roster: 'Aktuelle Liste', scope: 'Teilnehmende', spin: 'Rad drehen', start: 'Namensaufruf beginnen', people: 'Teilnehmerliste',
    lottery: 'Gewinnverlosung', prizeList: 'Liste der Gewinne', language: 'Sprache der Benutzeroberfläche', cache: 'Übersetzungscache leeren', englishNames: 'Englische Namen verwenden',
  },
  spanish: {
    random: 'Selección aleatoria de la lista', rollCall: 'Pase de lista', tools: 'Herramientas para pasar lista', title: 'Sorteo de nombres',
    roller: 'Nombres en movimiento', cards: 'Tarjetas con nombres', wheel: 'Ruleta de nombres', tunnel: 'Túnel de luz',
    seats: 'Sorteo por asiento', relay: 'Relevo de luciérnagas', riddle: 'Acertijo de pétalos', teams: 'Constelaciones',
    relayPrompt: '¿Quién encenderá el primer farol?', firstLight: 'El primer farol', tunnelPrompt: '¿Quién llegará después?',
    roster: 'Lista actual', scope: 'Participantes', spin: 'Girar la ruleta', start: 'Empezar a pasar lista', people: 'Lista de participantes',
    lottery: 'Sorteo de premios', prizeList: 'Lista de premios', language: 'Idioma de la interfaz', cache: 'Borrar la caché de traducción', englishNames: 'Usar los nombres en inglés',
  },
  russian: {
    random: 'Случайный выбор из списка', rollCall: 'Перекличка', tools: 'Инструменты переклички', title: 'Выбор имён',
    roller: 'Прокрутка имён', cards: 'Карточки с именами', wheel: 'Колесо имён', tunnel: 'Световой туннель',
    seats: 'Выбор по местам', relay: 'Эстафета светлячков', riddle: 'Загадка с лепестками', teams: 'Созвездия',
    relayPrompt: 'Кто зажжёт фонарь?', firstLight: 'Первый фонарь', tunnelPrompt: 'Кто прибудет следующим?',
    roster: 'Текущий список', scope: 'Участники', spin: 'Вращать колесо', start: 'Начать перекличку', people: 'Список участников',
    lottery: 'Розыгрыш призов', prizeList: 'Список призов', language: 'Язык интерфейса', cache: 'Очистить кеш перевода', englishNames: 'Использовать английские имена',
  },
  portuguese: {
    random: 'Seleção aleatória da lista', rollCall: 'Chamada', tools: 'Ferramentas de chamada', title: 'Sorteio de nomes',
    roller: 'Rolagem de nomes', cards: 'Cartas com nomes', wheel: 'Roleta de nomes', tunnel: 'Túnel de luz',
    seats: 'Sorteio por assento', relay: 'Revezamento dos vaga-lumes', riddle: 'Enigma das pétalas', teams: 'Constelações',
    relayPrompt: 'Quem vai acender a primeira lanterna?', firstLight: 'A primeira lanterna', tunnelPrompt: 'Quem chegará a seguir?',
    roster: 'Lista atual', scope: 'Participantes', spin: 'Girar a roleta', start: 'Iniciar a chamada', people: 'Lista de participantes',
    lottery: 'Sorteio de prêmios', prizeList: 'Lista de prêmios', language: 'Idioma da interface', cache: 'Limpar o cache de tradução', englishNames: 'Usar os nomes em inglês',
  },
  italian: {
    random: 'Estrazione casuale dall’elenco', rollCall: 'Appello', tools: 'Strumenti per l’appello', title: 'Estrazione di nomi',
    roller: 'Scorrimento dei nomi', cards: 'Carte con i nomi', wheel: 'Ruota dei nomi', tunnel: 'Tunnel di luce',
    seats: 'Estrazione per posto', relay: 'Staffetta delle lucciole', riddle: 'Indovinello dei petali', teams: 'Costellazioni',
    relayPrompt: 'Chi accenderà la prima lanterna?', firstLight: 'La prima lanterna', tunnelPrompt: 'Chi arriverà dopo?',
    roster: 'Elenco corrente', scope: 'Partecipanti', spin: 'Gira la ruota', start: 'Inizia l’appello', people: 'Elenco dei partecipanti',
    lottery: 'Estrazione premi', prizeList: 'Elenco dei premi', language: 'Lingua dell’interfaccia', cache: 'Svuota la cache delle traduzioni', englishNames: 'Usa i nomi in inglese',
  },
  vietnamese: {
    random: 'Chọn ngẫu nhiên từ danh sách', rollCall: 'Điểm danh', tools: 'Công cụ điểm danh', title: 'Bốc thăm tên',
    roller: 'Cuộn tên', cards: 'Thẻ tên', wheel: 'Vòng quay tên', tunnel: 'Đường hầm ánh sáng',
    seats: 'Chọn theo chỗ ngồi', relay: 'Chuyền đèn đom đóm', riddle: 'Câu đố cánh hoa', teams: 'Chòm sao',
    relayPrompt: 'Ai sẽ thắp chiếc đèn đầu tiên?', firstLight: 'Chiếc đèn đầu tiên', tunnelPrompt: 'Ai sẽ đến tiếp theo?',
    roster: 'Danh sách hiện tại', scope: 'Người tham gia', spin: 'Quay vòng quay', start: 'Bắt đầu điểm danh', people: 'Danh sách người tham gia',
    lottery: 'Bốc thăm trúng thưởng', prizeList: 'Danh sách giải thưởng', language: 'Ngôn ngữ giao diện', cache: 'Xóa bộ nhớ đệm bản dịch', englishNames: 'Dùng tên tiếng Anh',
  },
}

const dictionary = Object.fromEntries(Object.entries(terms).map(([locale, labels]) => [
  locale,
  new Map(Object.entries(keys).flatMap(([key, aliases]) => aliases.map(alias => [alias, labels[key]]))),
]))

export function exactUiTranslation(locale, text) {
  const match = String(text ?? '').match(/^(\s*)(.*?)(\s*)$/s)
  if (!match) return null
  const [, before, label, after] = match
  const value = dictionary[locale]?.get(label)
  return value ? before + value + after : null
}
