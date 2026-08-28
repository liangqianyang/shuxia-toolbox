/** 枫趣牌局聊天预设：后端 App\Service\Uno\UnoChat 的同步镜像（同拼豆色卡的双份同步约定）。
 *  局势分组是纯前端展示逻辑；id 必须与后端 PHRASES 白名单一致，否则服务端 422。
 */

export interface UnoPhrase {
  id: string
  text: string
}

export interface UnoPhraseGroup {
  key: string
  title: string
  phrases: UnoPhrase[]
}

/** 快捷句分组（面板展示顺序 = 通用 → +4/质疑 → 剩牌博弈 → 示弱；局势命中时相关组前置）。 */
export const UNO_PHRASE_GROUPS: UnoPhraseGroup[] = [
  {
    key: 'general',
    title: '通用',
    phrases: [
      { id: 'calm', text: '稳了稳了' },
      { id: 'careful_next', text: '下家小心点' },
      { id: 'scared', text: '怕了吧' },
      { id: 'so_mean', text: '你们真过分' },
    ],
  },
  {
    key: 'wild4',
    title: '+4 与质疑',
    phrases: [
      { id: 'no_other_cards', text: '我真没有别的牌了！' },
      { id: 'doubt_me', text: '不信你质疑啊' },
      { id: 'dare_bet', text: '你敢赌吗？' },
      { id: 'bet_lose6', text: '赌一把，输 6 张哦' },
    ],
  },
  {
    key: 'lastCard',
    title: '剩牌博弈',
    phrases: [
      { id: 'block_him', text: '拦住他！！' },
      { id: 'dont_let_run', text: '别让他跑了' },
      { id: 'last_card_red', text: '他最后一张八成是红色' },
      { id: 'last_card_green', text: '他最后一张八成是绿色' },
      { id: 'last_card_yellow', text: '他最后一张八成是黄色' },
      { id: 'last_card_blue', text: '他最后一张八成是蓝色' },
      { id: 'my_last_red', text: '我最后一张是红的，信我' },
      { id: 'my_last_not_green', text: '我最后一张不是绿色' },
      { id: 'guess_my_color', text: '猜猜我最后一张什么颜色~' },
      { id: 'about_to_win', text: '我好像要赢了~' },
    ],
  },
  {
    key: 'weak',
    title: '示弱（误导用）',
    phrases: [
      { id: 'bad_hand', text: '我牌好烂…' },
      { id: 'no_red_left', text: '没红牌了没红牌了' },
      { id: 'no_yellow_left', text: '没黄牌了没黄牌了' },
      { id: 'no_blue_left', text: '没蓝牌了没蓝牌了' },
      { id: 'no_green_left', text: '没绿牌了没绿牌了' },
      { id: 'sob', text: '呜呜呜' },
      { id: 'let_me_win', text: '让我赢吧😭' },
      { id: 'beg_you', text: '求求了🙏' },
    ],
  },
]

/** 表情面板（与后端 EMOJIS 白名单一致；发送时直接以表情字符为 id）。 */
export const UNO_EMOJIS: string[] = [
  '😀', '😂', '🤣', '😎', '🤔', '😏',
  '😭', '😡', '😱', '🥳', '😴', '🤡',
  '👍', '👎', '🙏', '🤝', '💪', '🔥',
  '❄️', '🍁', '🍀', '⚡️', '💣', '🎉',
  '😤', '🙃', '🙈',
]

/** 快捷句 id → 文案。 */
export function unoPhraseText(id: string): string {
  for (const group of UNO_PHRASE_GROUPS) {
    const hit = group.phrases.find((p) => p.id === id)
    if (hit) return hit.text
  }
  return ''
}
