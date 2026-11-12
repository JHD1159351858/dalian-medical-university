# 中医四诊 1080p 场景工作台与 AI 患者聊天设计图

- 交付：four-diagnosis-1080p-ai-patient-v3.png。
- 最终输出：1920 × 1080 PNG，16:9。
- 工具：内置 image_gen 生成设计内容；System.Drawing 完成最终尺寸导出。
- 生成源图：1672 × 941；等比导出为 1919 × 1080，右侧补白 1 像素，未裁切内容。
- 参考：four-diagnosis-redesign-v2.png，保持医疗蓝与成年患者形象。
- 示例对话根据 server/case.json 中王旭的病例编写，属于教学模拟。
- 本次交付为页面设计图与提示词；页面代码和接口未修改。

## 生成提示词

Use case: ui-mockup.
Primary request: revise the referenced finished Chinese clinical training UI into ONE 1920 × 1080 full-HD landscape high-fidelity design image according to the approved specification. IMPORTANT OUTPUT DIMENSIONS: exactly 1920 pixels wide and 1080 pixels high, 16:9 aspect ratio, not the portrait-ish ratio of the reference. Recompose all panels for a wide full-HD viewport; do not squeeze or stretch the old screenshot. Export one complete PNG design image. No multiple variants, no presentation board, no browser chrome or device frame.

Reference image role: keep its refined medical blue/teal visual language, adult patient's appearance and approachable 3D rendering style. Preserve the same Chinese male patient age 48, brown wavy short hair lightly graying at temples, mature facial proportions, blue-and-white striped patient pajamas. Recompose the room and interface. Do not keep the reference's old two-column recording layout.

Approved geometry at 1920 × 1080:
- One full-width top bar, y=0–72, height 72.
- Left flow rail x=0–176, y=72–1080, width 176.
- Center work area x=176–1500, y=72–1016, width 1324, with 24px internal padding.
- Fixed AI patient chat sidebar x=1500–1920, y=72–1016, width 420.
- Bottom action bar x=176–1920, y=1016–1080, height 64.
Use these proportions closely. Make ALL region edges and content visible within the 1080-high viewport. No outer scrollbars, huge lower empty area or centered app card.

Visual system: white and icy-blue work surfaces, deep navy headings, dark medical teal selected tools and primary buttons, restrained green status dots, subtle one-pixel dividers, about 10–12px corner radii, minimal soft shadows. Intentional grouping and spacing. Simplified Chinese sans-serif body text nominally 16px, helper text around 14px, main title 28–30px, Chinese serif only for brand/main title. Strong legible contrast. No tiny text, overdecorated glassmorphism, analytics widgets, cards within cards, invented features, gradients behind long text, floating chat popup, childish baby patient or doctor clothing.

TOP BAR:
Left compact medical icon + “大连医科大学”, supporting “临床问诊实训”.
Right green dot + “教学模拟环境”, outline “静音” and “重置训练” buttons.
Brand appears once only.

LEFT FLOW RAIL:
Heading “接诊流程”, small “CASE 01”.
Six vertical numbered entries:
“01 问诊”
“02 体格检查”
“03 中医四诊”
“04 辅助检查”
“05 诊断”
“06 处置”
First two have small completed checkmarks. Third visibly active in dark teal/soft blue with a left accent. The rest muted navy. Bottom supporting text “临床综合实训”. Nothing cropped.

CENTER WORK AREA:
At top a compact heading row with main “中医四诊”, supporting “望闻问切 · 证候采集”, inline identity “王旭 · 男 · 48 岁 · 门诊初诊”. On the right a small “0/5 已记录” label with an entirely pale-blue EMPTY progress track: zero completed, absolutely no teal filled portion.

Below heading, a practical FOUR-DIAGNOSIS TOOLBAR, height around 72px, using five equal horizontally aligned compact tools, not giant separated cards. Each tool has a clear appropriate medical outline icon, strong label and one short helper:
1 selected eye tool: “望诊”, “神色 · 形态 · 舌象”
2 ear tool: “闻诊”, “声音 · 呼吸 · 气味”
3 dialogue tool: “问诊”, “寒热 · 饮食 · 二便”
4 pulse tool: “切诊”, “脉象 · 腹部按诊”
5 clipboard tool: “四诊总结”, “四诊合参”
Selected 望诊 has clear teal emphasis. Other tools understated. Do not replace these task helpers with completion statistics. Tools are clearly task-oriented, not just decorative tabs.

Below toolbar the DOMINANT WIDE PATIENT SCENE, approximately x=200–1476 and y=258–784, width 1276 and height 526:
A panoramic bright modern examination room, softly desaturated medical aqua cabinetry, daylight, white examination bed, subtle environmental depth. The referenced mature adult male patient seated naturally on the bed at left/center-left, substantial upper body, both hands visible resting naturally near knees. He should look like the SAME adult character as the source. The panoramic scene fills this wide rectangular stage naturally; do not crop the patient's head or hands, stretch his face, make him a small distant figure, or enlarge him into a face-only portrait.
Subtle top-left tag “标准化病人”; bottom-left small tags “意识清楚” and green “患者在场”.
On the RIGHT INSIDE the panoramic scene, an elegant narrow task-guidance surface or unobtrusive overlay, around 290px wide, headed “望诊要点”. Four simple lines “神色”“形态”“舌质”“舌苔”, followed by “观察后，在下方记录检查所见。” It is a short teaching task prompt, not diagnosis, not a new chart or separate main sidebar. No fabricated actual tongue findings, pulse results, temperature or other measurements.

Below patient scene, a wide SINGLE RECORDING SURFACE, approximately y=800–992:
Header “望诊记录”, helper “神色、形态、舌质与舌苔”, a generous freeform multiline text area with exact placeholder “补充你的检查所见或判断…”. Blank records in this initial view. Make the area wide and usable, height around 190px total. Do not add a duplicated five-row module record list: the toolbar already carries navigation and overall record progress. No invented Save button, auto assessment or AI diagnosis. The student writes examination observations here.

RIGHT CHAT SIDEBAR:
This is a permanent docked window, not floating overlay, width 420, visually separated by a fine vertical divider.
Header “AI 患者 · 王旭”, subtle green availability status “可以提问”. Small supporting label “教学模拟”.
Readable scrollable conversation area with distinct speaker labels and softly tinted message bubbles. Only use the following short source-grounded example messages, in order:
Patient label “王旭”, message “医生，我身体不舒服。”
Student label “学生”, message “您哪里不舒服？这种情况多久了？”
Patient label “王旭”, message “左上腹疼了两天，近三小时还觉得喘不过气。”
Patient bubbles pale blue; student bubble restrained dark teal with white text. Bubble text comfortably 16px at this canvas scale, correct Chinese line breaks. Do not add extra AI tutor role, suggested diagnosis, examination findings, timestamps, generated citations or fictitious capabilities.
Composer anchored at the bottom of this chat column ABOVE the global footer. Label “向患者提问”. A two-line white input box with exact placeholder “向王旭提问…”, and a distinct teal Send button with paper-plane icon. The entire input and send button remain visible. No voice-recording microphone, attachments or tools absent from this brief. Messages may take the remaining height with calm purposeful spacing.

BOTTOM ACTION BAR:
Quiet left action “返回上一步” with left arrow.
Prominent right dark teal primary button “进入辅助检查” with RIGHT arrow.
Center small helper “完成当前项目后，继续下一模块”.
Bar height around 64px, aligned cleanly with center and chat. Full buttons visible, adequate click target size.

Hard constraints: one full-HD landscape screen, all six steps and all five four-diagnosis tools visible, large patient scenario, recording below it, permanent AI PATIENT chat on right, correct 王旭 / 男 / 48岁 identity, all Chinese copy legible and correct. Do not invent patient measurements or medical results. The displayed 0/5 record progress must be empty and consistent. Make the design immediately recognizable as an immersive practical clinical teaching workstation rather than a generic dashboard.

