/**
 * 共享数据层：题库、维度、原型、计分。
 * 前端与后端共用同一份，保证"用户看到的"和"服务器算出的"完全一致。
 */

export const DIMENSIONS = {
  D1: { key: 'D1', name: '察言观色', palace: '听得懂话外音', weight: 0.20 },
  D2: { key: 'D2', name: '人情经营', palace: '有没有人替你说话', weight: 0.15 },
  D3: { key: 'D3', name: '情绪自控', palace: '沉不沉得住气', weight: 0.20 },
  D4: { key: 'D4', name: '进退分寸', palace: '知不知道该说什么', weight: 0.20 },
  D5: { key: 'D5', name: '决断魄力', palace: '敢不敢下手', weight: 0.15 },
  D6: { key: 'D6', name: '心性底线', palace: '愿不愿脏手', weight: 0.10 },
};

export const DIM_ORDER = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];

/** 25 题。每题 4 个选项，分值为该选项在本题维度上的成熟度（0-4）。 */
export const QUESTIONS = [
  // ============ D1 察言观色 ============
  {
    id: 'Q1',
    dim: 'D1',
    scene: '宫斗映射：皇上问「你以为如何」，其实心里早有答案',
    text: '开会时，领导问「大家还有什么意见吗」，语气很平，眼睛没看任何人。',
    options: [
      { text: '当场指出三个漏洞', score: 1 },
      { text: '「整体没问题，有两个细节想私下跟你确认」', score: 4 },
      { text: '沉默，会后在群里发文字补充', score: 2 },
      { text: '顺着夸两句，会后找相关同事打听', score: 3 },
    ],
  },
  {
    id: 'Q2',
    dim: 'D1',
    scene: '宫斗映射：席间一句「姐姐今日气色真好」',
    text: '朋友聚会，有人当众说「你最近是不是胖了」，然后笑着看你。',
    options: [
      { text: '当场笑着回怼', score: 2 },
      { text: '自嘲一句带过，把话头转走', score: 4 },
      { text: '不接话，转头跟别人聊', score: 3 },
      { text: '事后单独问她什么意思', score: 1 },
    ],
  },
  {
    id: 'Q3',
    dim: 'D1',
    scene: '宫斗映射：有人在众人面前递上一句「这账不对」',
    text: '同事在群里 @ 你：「这个数据是你给的吗？好像和上次不一样。」',
    options: [
      { text: '立刻在群里解释全部过程', score: 2 },
      { text: '回「我核对一下，稍后同步」', score: 4 },
      { text: '私聊他，问是不是有人说了什么', score: 3 },
      { text: '不回，等领导表态', score: 1 },
    ],
  },
  {
    id: 'Q4',
    dim: 'D1',
    scene: '宫斗映射：家书里那句没写完的话',
    text: '你妈说「你表哥今年买房了」，然后没再说话。',
    options: [
      { text: '说「挺好的，恭喜他」', score: 1 },
      { text: '说「我最近也在看」', score: 4 },
      { text: '反问「你是不是想说什么」', score: 3 },
      { text: '沉默', score: 2 },
    ],
  },
  {
    id: 'Q5',
    dim: 'D1',
    scene: '宫斗映射：新来的宫女格外殷勤',
    text: '新来的同事对你格外热情，主动帮你带咖啡、问你项目细节。',
    options: [
      { text: '全盘告诉他', score: 1 },
      { text: '客气接受，关键信息留一手', score: 4 },
      { text: '直接问「你想干什么」', score: 3 },
      { text: '疏远他', score: 2 },
    ],
  },

  // ============ D2 人情经营 ============
  {
    id: 'Q6',
    dim: 'D2',
    scene: '宫斗映射：内务府那个不管事的老太监',
    text: '公司有个不起眼的行政阿姨，掌握着所有会议室和报销的实际操作权。',
    options: [
      { text: '从不在意', score: 1 },
      { text: '每次见面都打招呼，偶尔带点小东西', score: 4 },
      { text: '有事才找她', score: 2 },
      { text: '觉得没必要，流程自己会走', score: 1 },
    ],
  },
  {
    id: 'Q7',
    dim: 'D2',
    scene: '宫斗映射：替人挡了一刀，对方只当没发生',
    text: '你帮了同事一个大忙，他没提感谢。',
    options: [
      { text: '直接说「这事我费了不少劲」', score: 2 },
      { text: '不提，但下次他找你时提一句', score: 4 },
      { text: '完全不计较', score: 3 },
      { text: '跟第三方吐槽', score: 1 },
    ],
  },
  {
    id: 'Q8',
    dim: 'D2',
    scene: '宫斗映射：位分升了，旧日同僚开始避着你',
    text: '你升职了，原来的同级同事开始疏远你。',
    options: [
      { text: '主动请他们吃饭', score: 3 },
      { text: '保持距离，避免尴尬', score: 1 },
      { text: '找其中最关键的一个单独聊', score: 4 },
      { text: '不在意', score: 2 },
    ],
  },
  {
    id: 'Q9',
    dim: 'D2',
    scene: '宫斗映射：有人在背后递话，等你接',
    text: '有人在你面前说另一个人的坏话。',
    options: [
      { text: '附和两句', score: 1 },
      { text: '不接话，把话题转开', score: 4 },
      { text: '帮那人说两句好话', score: 3 },
      { text: '记下来，以后用', score: 2 },
    ],
  },

  // ============ D3 情绪自控 ============
  {
    id: 'Q10',
    dim: 'D3',
    scene: '宫斗映射：众目睽睽之下被推出来顶罪',
    text: '你被当众甩锅，会议室里十几个人看着你。',
    options: [
      { text: '当场反驳，把责任推回去', score: 1 },
      { text: '「我回去查一下，稍后给结论」', score: 4 },
      { text: '承认「这块我确实有责任」，会后单独找领导', score: 3 },
      { text: '沉默，脸色很难看', score: 2 },
    ],
  },
  {
    id: 'Q11',
    dim: 'D3',
    scene: '宫斗映射：你熬的方子，被人端去邀功',
    text: '你熬夜做的方案，被同事拿去汇报，领导当场表扬了他。',
    options: [
      { text: '当场说「这个是我做的」', score: 2 },
      { text: '会后发邮件补全流程记录', score: 4 },
      { text: '忍了', score: 1 },
      { text: '私下跟领导说', score: 3 },
    ],
  },
  {
    id: 'Q12',
    dim: 'D3',
    scene: '宫斗映射：家宴上那句「还没个着落」',
    text: '你妈又在亲戚面前说你「还没对象」。',
    options: [
      { text: '当场怼回去', score: 1 },
      { text: '笑着糊弄过去', score: 4 },
      { text: '事后认真跟她谈一次', score: 3 },
      { text: '站起来走开', score: 2 },
    ],
  },
  {
    id: 'Q13',
    dim: 'D3',
    scene: '宫斗映射：差事一件接一件，没人问你累不累',
    text: '你已经连续加班一个月，领导又加了一个任务。',
    options: [
      { text: '直接说「我做不完」', score: 2 },
      { text: '接下，但列出优先级让他选', score: 4 },
      { text: '接下拉倒，做完再说', score: 3 },
      { text: '抱怨，但照做', score: 1 },
    ],
  },

  // ============ D4 进退分寸 ============
  {
    id: 'Q14',
    dim: 'D4',
    scene: '宫斗映射：明知旨意有误，满殿无人开口',
    text: '领导的决策你确信有问题，会上所有人都不说话。',
    options: [
      { text: '当场提出来', score: 1 },
      { text: '会后单独说', score: 4 },
      { text: '不说，但留下邮件记录', score: 3 },
      { text: '私下提醒可能受影响的同事', score: 2 },
    ],
  },
  {
    id: 'Q15',
    dim: 'D4',
    scene: '宫斗映射：宫里传的一句话，真假难辨',
    text: '你听到一个关于领导的传闻，可能是真的。',
    options: [
      { text: '跟关系好的同事聊', score: 1 },
      { text: '谁都不说', score: 4 },
      { text: '装作听说过，试探别人', score: 3 },
      { text: '直接问领导本人', score: 2 },
    ],
  },
  {
    id: 'Q16',
    dim: 'D4',
    scene: '宫斗映射：新主旧主，都在看你站哪边',
    text: '公司来了新领导，有意提拔你，但老领导还在。',
    options: [
      { text: '立刻向新领导靠拢', score: 1 },
      { text: '保持中立，做好本职', score: 4 },
      { text: '两边都不得罪，但都不承诺', score: 3 },
      { text: '找机会公开表态', score: 2 },
    ],
  },
  {
    id: 'Q17',
    dim: 'D4',
    scene: '宫斗映射：有人探你的底',
    text: '亲戚问你工资多少。',
    options: [
      { text: '直接说', score: 1 },
      { text: '说个大概', score: 3 },
      { text: '笑着说「够花」', score: 4 },
      { text: '反问「你猜」', score: 2 },
    ],
  },

  // ============ D5 决断魄力 ============
  {
    id: 'Q18',
    dim: 'D5',
    scene: '宫斗映射：抓到把柄，出不出手',
    text: '你发现同事在背后做对你不利的事，证据确凿。',
    options: [
      { text: '立刻摊牌', score: 2 },
      { text: '收集更多证据，等一次能一击致命的机会', score: 4 },
      { text: '找领导说', score: 3 },
      { text: '装作不知道，暗中防', score: 1 },
    ],
  },
  {
    id: 'Q19',
    dim: 'D5',
    scene: '宫斗映射：一步登天的机会，代价是得罪权臣',
    text: '一个机会摆在你面前，但需要得罪一个有权势的人。',
    options: [
      { text: '放弃', score: 1 },
      { text: '要，正面争取', score: 4 },
      { text: '要，但让别人出面', score: 3 },
      { text: '观望', score: 2 },
    ],
  },
  {
    id: 'Q20',
    dim: 'D5',
    scene: '宫斗映射：明知是消耗，还要不要留',
    text: '你已经确认这段关系在消耗你。',
    options: [
      { text: '立刻结束', score: 4 },
      { text: '慢慢淡出', score: 3 },
      { text: '继续，舍不得', score: 1 },
      { text: '等对方先走', score: 2 },
    ],
  },
  {
    id: 'Q21',
    dim: 'D5',
    scene: '宫斗映射：用不用那个能办事、但心不正的人',
    text: '团队里有个能力极强但人品有问题的人，你是负责人。',
    options: [
      { text: '用他，但防着他', score: 4 },
      { text: '不用', score: 1 },
      { text: '用，并且给他足够空间', score: 3 },
      { text: '先观察一段时间', score: 2 },
    ],
  },

  // ============ D6 心性底线 ============
  {
    id: 'Q22',
    dim: 'D6',
    scene: '宫斗映射：一条捷径，代价是踩过一个人',
    text: '有一个能让你少奋斗五年的机会，代价是让一个和你没仇的人背锅，而且几乎确定不会有人知道。',
    options: [
      { text: '绝不', score: 0 },
      { text: '会犹豫，但最后不会', score: 1 },
      { text: '会做，但事后补偿他', score: 2 },
      { text: '会做', score: 4 },
    ],
  },
  {
    id: 'Q23',
    dim: 'D6',
    scene: '宫斗映射：忍了多年，终于等来反击的机会',
    text: '你被一个人长期欺负，现在你有机会让他吃一个大亏。',
    options: [
      { text: '算了', score: 0 },
      { text: '让他吃点小亏', score: 1 },
      { text: '让他付出同等代价', score: 3 },
      { text: '加倍', score: 4 },
    ],
  },
  {
    id: 'Q24',
    dim: 'D6',
    scene: '宫斗映射：一句虚言，可平一场风波',
    text: '说一句谎，能让所有人都满意，也没人会受损。',
    options: [
      { text: '说', score: 4 },
      { text: '不说', score: 0 },
      { text: '说一半', score: 2 },
      { text: '看情况', score: 3 },
    ],
  },
  {
    id: 'Q25',
    dim: 'D6',
    scene: '宫斗映射：同盟之人行事不端，你知不知情',
    text: '你朋友做了一件对别人不公平的事，但对你有利。',
    options: [
      { text: '装不知道', score: 3 },
      { text: '私下劝他', score: 2 },
      { text: '告诉受害的人', score: 1 },
      { text: '跟他一起', score: 4 },
    ],
  },
];

/** 投放顺序：前 3 题用留存最高的情境，其余六维打散交错。 */
export const USER_ORDER = [
  'Q10', 'Q11', 'Q22', 'Q1', 'Q18', 'Q6', 'Q14',
  'Q12', 'Q23', 'Q2', 'Q19', 'Q7', 'Q15', 'Q13',
  'Q24', 'Q3', 'Q20', 'Q16', 'Q4', 'Q25', 'Q8',
  'Q17', 'Q21', 'Q5', 'Q9',
];

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
export const TOTAL_QUESTIONS = QUESTIONS.length;
