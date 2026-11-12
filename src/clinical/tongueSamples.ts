export interface TongueSample {
  id: string
  label: string
  group: string
  image: string
  features: string[]
  interpretation: string[]
  recognition: string
  source: string
  sourceParagraph: number
  hasEmbeddedLabel: boolean
  acceptedAnswers: string[]
}

// 原图与文字来自用户提供的文档，不代表当前病例的检查结果。
export const tongueSamples: TongueSample[] = [
  {
    "id": "tongue-1",
    "label": "正常舌象",
    "group": "舌质",
    "image": "/four-exam-images/tongue-library/image1.jpeg",
    "features": [
      "舌质：淡红色，颜色均匀，明润有光泽。",
      "舌形：大小适中，不胖不瘦，柔软灵活。",
      "舌苔：薄白，分布均匀，舌质隐约可见。",
      "舌面：润泽适中，不干燥，也不过分湿滑。"
    ],
    "interpretation": [
      "正常舌象通常称为“淡红舌、薄白苔”，传统上认为提示胃气充足、气血调和、津液尚充。"
    ],
    "recognition": "舌质：淡红色，颜色均匀，明润有光泽。舌苔：薄白，分布均匀，舌质隐约可见。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 2,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "正常舌象",
      "薄白苔",
      "淡红舌薄白苔"
    ]
  },
  {
    "id": "tongue-2",
    "label": "舌暗红",
    "group": "舌质",
    "image": "/four-exam-images/tongue-library/image2.jpeg",
    "features": [
      "舌质颜色比正常舌深，呈暗红色。",
      "舌体可能偏干，也可能伴有瘀点、瘀斑。",
      "可伴薄白苔、薄黄苔或少苔等不同舌苔表现。"
    ],
    "interpretation": [
      "热证：尤其需要结合舌面干燥程度及其他热象辨别。",
      "瘀血证：如果舌色晦暗，兼有瘀点、瘀斑，可考虑血瘀的辨证方向。",
      "阴液亏虚：若同时舌红少津、少苔，可考虑阴虚内热。"
    ],
    "recognition": "暗红舌不等同于绛红舌，通常暗红的色泽偏晦暗，而绛红的颜色更深、更鲜明。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 10,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "舌暗红",
      "暗红舌"
    ]
  },
  {
    "id": "tongue-3",
    "label": "舌淡嫩",
    "group": "舌质",
    "image": "/four-exam-images/tongue-library/image3.jpeg",
    "features": [
      "舌质颜色浅淡，常呈淡红色或淡白色。",
      "舌体质地细嫩，纹理不粗糙。",
      "舌体常较柔软、胖嫩，有时舌边伴齿痕。",
      "舌面可能湿润，舌苔多为薄白苔。"
    ],
    "interpretation": [
      "气血亏虚。",
      "阳虚证。",
      "若舌体胖嫩、湿润明显，兼有畏寒、乏力、便溏等表现，可考虑阳虚或水湿内停的辨证方向。"
    ],
    "recognition": "“淡”主要指舌色浅，“嫩”主要指舌体纹理细腻、质地娇嫩，两者观察重点不同。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 21,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "舌淡嫩",
      "淡嫩舌"
    ]
  },
  {
    "id": "tongue-4",
    "label": "齿痕舌",
    "group": "舌质",
    "image": "/four-exam-images/tongue-library/image4.jpeg",
    "features": [
      "舌体边缘出现明显的牙齿压痕。",
      "舌体常偏胖大，舌边呈波浪状或锯齿状。",
      "可伴舌色淡、舌体湿润、薄白苔等表现。",
      "齿痕有时也可出现在舌体大小基本正常的人身上。"
    ],
    "interpretation": [
      "脾气虚。",
      "脾阳虚。",
      "水湿内停。"
    ],
    "recognition": "齿痕舌如果同时出现舌淡、胖嫩、湿润，传统辨证更倾向于脾虚、阳虚或水湿内停；如果舌质红、苔黄腻，则需要考虑不同的证候组合。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 33,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "齿痕舌"
    ]
  },
  {
    "id": "tongue-5",
    "label": "舌瘀斑",
    "group": "舌质",
    "image": "/four-exam-images/tongue-library/image5.jpeg",
    "features": [
      "舌面出现紫色、青紫色或暗红色的斑点。",
      "瘀点通常较小，瘀斑通常面积较大。",
      "舌质可呈淡红偏暗、紫暗或青紫色。",
      "舌苔可为薄白、薄黄，也可能伴其他变化。"
    ],
    "interpretation": [
      "血瘀证。",
      "气滞血瘀。",
      "寒凝血瘀。",
      "某些热入营血的证候也可能出现紫暗、瘀点等表现。"
    ],
    "recognition": "重点观察斑点的颜色、大小、分布，以及舌质整体是否紫暗。传统中医辨证认为，瘀点、瘀斑常与血行不畅有关。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 45,
    "hasEmbeddedLabel": true,
    "acceptedAnswers": [
      "舌瘀斑",
      "瘀斑舌"
    ]
  },
  {
    "id": "tongue-6",
    "label": "舌绛红",
    "group": "舌质",
    "image": "/four-exam-images/tongue-library/image6.jpeg",
    "features": [
      "舌质呈深红色，颜色明显深于一般红舌。",
      "舌面可能干燥，舌苔可能减少、剥落，甚至无苔。",
      "部分舌象会出现舌面干裂或红绛而光亮的表现。"
    ],
    "interpretation": [
      "热入营血。",
      "热盛伤阴。",
      "阴虚火旺。",
      "若舌绛而少苔、无苔，同时伴口干等表现，传统辨证常考虑阴液受损。"
    ],
    "recognition": "绛红舌的主要特征是颜色深红；如果同时少苔、剥苔或光苔，应将舌质与舌苔结合观察，不能只凭颜色判断病情。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 58,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "舌绛红",
      "绛红舌"
    ]
  },
  {
    "id": "tongue-7",
    "label": "薄白苔",
    "group": "舌苔",
    "image": "/four-exam-images/tongue-library/image1.jpeg",
    "features": [
      "舌苔呈白色，薄薄地覆盖在舌面上。",
      "能透过舌苔看到舌质的颜色。",
      "苔质均匀，颗粒细腻。",
      "正常情况下润燥适中，不黏腻、不干燥。"
    ],
    "interpretation": [
      "正常舌象。",
      "表证。",
      "寒证。"
    ],
    "recognition": "薄白苔并不一定代表疾病。正常人的舌苔通常就是薄白苔，需要结合舌质颜色、厚薄、润燥等特征判断。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 71,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "正常舌象",
      "薄白苔",
      "淡红舌薄白苔"
    ]
  },
  {
    "id": "tongue-8",
    "label": "薄黄苔",
    "group": "舌苔",
    "image": "/four-exam-images/tongue-library/image7.jpeg",
    "features": [
      "舌苔呈淡黄色或浅黄色。",
      "苔质较薄，通常可以透见舌质。",
      "苔面分布相对均匀，不明显黏腻。",
      "舌质可呈淡红色或稍红。"
    ],
    "interpretation": [
      "风热表证。",
      "表邪入里化热。",
      "一般里热证的早期表现之一。"
    ],
    "recognition": "薄黄苔与黄腻苔的主要区别在于苔质。薄黄苔较薄、较疏松；黄腻苔则颗粒细密、黏腻，通常覆盖更厚。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 83,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "薄黄苔"
    ]
  },
  {
    "id": "tongue-9",
    "label": "白腻苔",
    "group": "舌苔",
    "image": "/four-exam-images/tongue-library/image8.jpeg",
    "features": [
      "舌苔呈白色，颗粒细密。",
      "苔质致密、黏腻，紧贴舌面。",
      "舌质可能淡红、淡白或偏暗。",
      "可伴舌体胖大、湿润等表现。"
    ],
    "interpretation": [
      "湿浊内蕴。",
      "痰湿内阻。",
      "食积。",
      "脾失健运。"
    ],
    "recognition": "白腻苔的关键是“腻”，也就是苔质细密、黏腻，和普通薄白苔不同。若同时舌淡胖、齿痕明显，传统辨证常考虑脾虚夹湿。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 95,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "白腻苔"
    ]
  },
  {
    "id": "tongue-10",
    "label": "黄腻苔",
    "group": "舌苔",
    "image": "/four-exam-images/tongue-library/image9.jpeg",
    "features": [
      "舌苔呈黄色或深黄色。",
      "苔质颗粒细密、黏腻，附着较紧。",
      "苔面可能较厚，舌质可呈红色或暗红色。",
      "有时还会伴口中黏腻、口苦等症状。"
    ],
    "interpretation": [
      "湿热蕴结。",
      "痰热内蕴。",
      "食积化热。",
      "湿温证。"
    ],
    "recognition": "黄腻苔通常兼有“黄色”和“腻”的特点。黄色主要用于辨别热象，腻苔则提示湿浊、痰湿等因素，但仍须结合具体症状分析。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 108,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "黄腻苔"
    ]
  },
  {
    "id": "tongue-11",
    "label": "剥苔",
    "group": "舌苔",
    "image": "/four-exam-images/tongue-library/image10.jpeg",
    "features": [
      "舌苔部分区域脱落，露出舌质。",
      "剥落处与未剥落处界限可能较明显。",
      "可呈地图样、不规则片状或局部剥落。",
      "剥落处可能光滑，也可能发红。"
    ],
    "interpretation": [
      "胃气不足。",
      "胃阴不足。",
      "气阴两虚。",
      "若舌质偏红、剥落处光亮，传统辨证常考虑阴液不足。"
    ],
    "recognition": "剥苔的核心是舌苔呈片状或局部脱落，而不是整个舌面都没有舌苔。需要注意，地图舌也可能出现在没有明显全身疾病的人群中。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 121,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "剥苔"
    ]
  },
  {
    "id": "tongue-12",
    "label": "少苔",
    "group": "舌苔",
    "image": "/four-exam-images/tongue-library/image11.jpeg",
    "features": [
      "舌面覆盖的舌苔明显减少。",
      "舌质大面积暴露，但仍可见少量舌苔。",
      "舌面可能偏干，也可能保留一定润泽。",
      "舌质可呈淡红、红色或绛红色。"
    ],
    "interpretation": [
      "胃阴不足。",
      "阴虚。",
      "气阴两虚。"
    ],
    "recognition": "少苔强调“舌苔数量减少”，不一定完全消失。如果舌质红、舌面干燥，同时伴口干等症状，传统辨证更倾向于阴液不足。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 134,
    "hasEmbeddedLabel": true,
    "acceptedAnswers": [
      "少苔"
    ]
  },
  {
    "id": "tongue-13",
    "label": "光苔（镜面舌）",
    "group": "舌苔",
    "image": "/four-exam-images/tongue-library/image12.jpeg",
    "features": [
      "舌面几乎完全没有舌苔。",
      "舌面光滑、光亮，像镜面一样。",
      "舌乳头可能不明显，表面显得平滑。",
      "舌质可以呈红色、绛红色，也可能偏淡。"
    ],
    "interpretation": [
      "胃阴枯涸。",
      "胃气不足。",
      "气阴两虚。",
      "如果舌质淡白、舌面光滑无苔，传统辨证还会考虑气血亏虚等情况。"
    ],
    "recognition": "光苔与少苔的区别是：少苔仍残留部分舌苔，而光苔通常表现为舌面大部分或全部光滑无苔。",
    "source": "舌象图片及形态介绍.docx",
    "sourceParagraph": 146,
    "hasEmbeddedLabel": false,
    "acceptedAnswers": [
      "光苔（镜面舌）",
      "光苔",
      "镜面舌"
    ]
  }
]

export const practiceTongueSamples = tongueSamples.filter((sample, index, all) =>
  !sample.hasEmbeddedLabel && all.findIndex((other) => other.image === sample.image) === index,
)

export function selectTongueQuestion(previousId?: string, random: () => number = Math.random): TongueSample {
  const previous = tongueSamples.find((sample) => sample.id === previousId)
  const candidates = practiceTongueSamples.filter((sample) => sample.image !== previous?.image)
  return candidates[Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))]
}

export function isTongueAnswerCorrect(sample: TongueSample, answer: string): boolean {
  const normalize = (text: string) => text.trim().replace(/[\s，。、（）()]/g, '')
  return !!answer.trim() && sample.acceptedAnswers.some((accepted) => normalize(accepted) === normalize(answer))
}
