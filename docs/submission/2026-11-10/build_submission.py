"""Fill official participant template; numbers come from captured result snapshots."""
from pathlib import Path
import argparse,json,hashlib
from decimal import Decimal
from copy import deepcopy
from lxml import etree
from docx import Document
from docx.shared import Pt,Mm,RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.table import WD_TABLE_ALIGNMENT,WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.part import Part
from docx.opc.packuri import PackURI
from docx.opc.constants import RELATIONSHIP_TYPE as RT

HERE=Path(__file__).resolve().parent
P=argparse.ArgumentParser();P.add_argument('--template',type=Path,required=True);args=P.parse_args()
D=Document(args.template)
for e in list(D._element.body):
 if e.tag!=qn('w:sectPr'):D._element.body.remove(e)
for s in D.sections:
 s.page_width=Mm(210);s.page_height=Mm(297)
 s.top_margin=s.bottom_margin=s.left_margin=s.right_margin=Mm(20)
 for x in list(s.header._element):s.header._element.remove(x)
 for x in list(s.footer._element):s.footer._element.remove(x)
for name,size,bold in [('Normal',10,False),('Title',13,True),('Heading 1',11,True),('Heading 2',11,True)]:
 if name not in D.styles: D.styles.add_style(name,WD_STYLE_TYPE.PARAGRAPH)
 st=D.styles[name];st.font.name='맑은 고딕';st.font.size=Pt(size);st.font.bold=bold;st.font.color.rgb=RGBColor(0,0,0)
 st._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'),'맑은 고딕')
 st.paragraph_format.line_spacing=1.5;st.paragraph_format.space_after=Pt(5);st.paragraph_format.space_before=Pt(0)
 if name!='Normal':st.paragraph_format.keep_with_next=True
S=json.loads((HERE/'evidence/initial-snapshot.json').read_text())
V=json.loads((HERE/'evidence/revised-snapshot.json').read_text())
U=json.loads((HERE/'evidence/partial-snapshot.json').read_text())
R=S['engine_output']['results'];C=R['OUT-05']['candidates'];RC=V['engine_output']['results']['OUT-05']['candidates']
G=R['OUT-04']['rows'][0]
def m(v):
 if v is None:return '미확정'
 return format(Decimal(v)/10000,'f').rstrip('0').rstrip('.') if '.' in format(Decimal(v)/10000,'f') else format(Decimal(v)/10000,'f')
def p(t='',style=None):
 previous=D._element.body[-2] if len(D._element.body)>1 else None
 x=D.add_paragraph(t,style)
 if previous is not None and previous.tag==qn('w:tbl'):x.paragraph_format.space_before=Pt(4)
 x.alignment=WD_ALIGN_PARAGRAPH.LEFT;x.paragraph_format.widow_control=True;return x
def h(t):return p(t,'Heading 1')
def page(t):
 x=h(t);x.paragraph_format.page_break_before=True
def table(headers,rows,widths=None):
 t=D.add_table(rows=1,cols=len(headers));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
 if widths:
  for c,w in zip(t.columns,widths):c.width=Mm(w)
 for c,v in zip(t.rows[0].cells,headers):c.text=str(v)
 for row in rows:
  cells=t.add_row().cells
  for c,v in zip(cells,row):c.text=str(v)
 props=t._tbl.tblPr;borders=OxmlElement('w:tblBorders')
 for tag in ['top','left','bottom','right','insideH','insideV']:
  x=OxmlElement('w:'+tag);x.set(qn('w:val'),'single');x.set(qn('w:sz'),'4');x.set(qn('w:color'),'D9D9D9');borders.append(x)
 props.append(borders)
 for ri,row in enumerate(t.rows):
  pr=row._tr.get_or_add_trPr();pr.append(OxmlElement('w:cantSplit'))
  if ri==0:pr.append(OxmlElement('w:tblHeader'))
  for ci,c in enumerate(row.cells):
   c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
   tcpr=c._tc.get_or_add_tcPr();mar=OxmlElement('w:tcMar')
   for side in ['top','left','bottom','right']:
    x=OxmlElement('w:'+side);x.set(qn('w:w'),'85');x.set(qn('w:type'),'dxa');mar.append(x)
   tcpr.append(mar)
   if ri==0:
    sh=OxmlElement('w:shd');sh.set(qn('w:fill'),'E8ECF7');tcpr.append(sh)
   for para in c.paragraphs:
    para.alignment=WD_ALIGN_PARAGRAPH.LEFT;para.paragraph_format.line_spacing=1.5;para.paragraph_format.space_after=Pt(2)
    for run in para.runs:
     run.font.size=Pt(10);run.font.bold=ri==0;run.font.name='맑은 고딕';run._element.get_or_add_rPr().get_or_add_rFonts().set(qn('w:eastAsia'),'맑은 고딕')
 return t
NOTES=[]
def foot(para,text):
 NOTES.append(text);r=para.add_run();r.font.superscript=True
 e=OxmlElement('w:footnoteReference');e.set(qn('w:id'),str(len(NOTES)));r._element.append(e)
def pic(name,width=166):
 q=p();q.add_run().add_picture(str(HERE/'captures'/name),width=Mm(width))
def caption(t):
 q=p(t);q.paragraph_format.keep_with_next=False

p('재무설계 사례 보고서 본문','Title')
p('B안 가상 가구의 교육비 준비와 투자 여력 비교','Heading 1')
p('단기 교육비를 준비하면서 장기 은퇴 준비를 놓치지 않기 위한 재무설계 사례다. 교육비의 금액과 지급일을 먼저 고정하고, 같은 소득·생활비·유지납입 조건에서 두 월별 후보를 비교한다. 현재 확인한 숫자와 추가 확인이 필요한 부분을 함께 제시하며, 실제 고객 상담이나 금융거래를 수행한 사례로 서술하지 않는다.')
q=p('과제는 B안 가상 고객 사례이며 재무설계 여섯 단계를 한 사례로 연결한다. 본문과 AI 활용 부록은 같은 파일에 작성했다.');foot(q,'한국재무설계협회 공고, 2026-11-10 열람. https://www.ifpk.org/?data_usn=181814&mnu_usn=67&mode=view&page_no=1')
h('가상 고객과 분석 범위')
table(['구분','사례 설정'],[
 ('가구','성인 39세·37세와 자녀 11세의 3인 가구. 모든 인물은 가상이다.'),
 ('생활단계','자녀 학령기와 은퇴 준비가 중첩된다. 나이로 목표나 투자성향을 자동 결정하지 않는다.'),
 ('소득과 주거','자영업·시간제 근로의 합산 세후소득 월500만원. 주거는 회사 지원으로 자기부담 보증금0인 단순 가정이다.'),
 ('평가 기준','2026-11-30을 가상의 평가일로 설정. 2026-11월 소득·생활비, 전망은 2026-12~2027-02.'),
 ('현재 재산','분석 범위 현금2,000만원, 다른 자산·채무는 없는 가상 조건. 현금 전액을 투자재원으로 보지 않는다.'),
 ('유지납입','월50만원 투자예산 약정을 유지하고 12월부터 전망에 반영한다. 평가일의 과거 투자실적을 가정하지 않는다.'),
 ('우선 목표','2027-02-28 교육비500만원, 현재 현금 중200만원을 목표 준비금으로 지정.'),
 ('장기 목표','은퇴 생활의 재원 점검. 공식 예상연금액과 은퇴생활비 자료가 없어 결과 금액은 미확정이다.')],[30,136])
p('핵심 판단은 교육비 월100만원을 먼저 구분하고, 나머지 예산에서 월75만원 또는120만원을 신규투자 검토 후보로 비교하는 것이다. 두 후보는 상품 적합성 검증 전이므로 실제 권장액과 고객 채택액은 미확정이다.')

page('1단계 고객과의 관계 정립')
p('가상 가구가 원하는 것은 투자비중을 곧바로 정하는 일보다 교육비 지급을 준비하면서 생활의 안전과 장기 준비를 함께 보는 것이다. 정보의 귀속은 가구 단위로 정하고 포함 소유자를 adult-1과 adult-2로 명시한다. 한 사람의 돈과 공동 돈을 중복 합산하지 않으며, 상속 예상액이나 부동산 처분대금을 현재 현금으로 간주하지 않는다.')
p('분석 범위는 확인한 현금, 동일 기간의 월 흐름, 교육비 지급과 월별 후보 비교다. 실제 계좌조회·금융상품 적합성 심사·자동이체·매매는 수행하지 않는다. 화면의 저장은 별도 원응답 PoC를 연결한 로컬 데모이며 운영 인증·보안인증을 의미하지 않는다. 이해관계나 수수료가 확인되지 않은 상품을 추천하지 않는다.')
h('2단계 재무목표 설정 및 자료수집')
table(['자료','가상 입력과 확인 방식','사용 위치'],[
 ('월 세후소득','원문 00500.0000, 만원, SCENARIO, 11월','현재 흐름·월 후보'),
 ('월 생활비','원문 00200.0000, 만원. 상환·저축 이체 제외 확인','현금흐름·보호 기준'),
 ('필수 생활비','월200만원이라는 가정. 총생활비와 별도 필드 보존','보호·운영 정책'),
 ('부채','부채 없음으로 명시. 모름을0으로 바꾸지 않음','상환 차감 여부'),
 ('기존 유지납입','월50만원, 가구원 귀속·비현금 이전·급여 중복공제 없음','월 흐름·투자자산 이동'),
 ('목표 지급','교육비500만원, 2027-02-28, 명목금액·무수익','목표 달력'),
 ('목표 준비금','현금 원장 cash-1의200만원을 r-g로 참조','목표 이중배정 방지'),
 ('적립 기회','12월15일·1월15일·2월15일의3회','월100만원 산출'),
 ('확인 대기','급여 입금일·공식 예상연금·추가세금 자료','일별 검토·은퇴 후속 분석')],[29,103,34])
p('간편 화면에서는 소득·소득상태·생활비·목표분기·목표액·지급일의6개 컨트롤을 확인했다. 목표 없음 확인 시 목표액과 지급일을 숨겨4개가 된다. 반복 원장과 시나리오 확인값은 예시 원문을 재사용하므로 실제 고객이6칸만 입력하면 모든 자료가 완성된다는 뜻은 아니다.')

page('3단계 재무상태 분석 및 평가')
h('현재 자산과 자금의 용도')
p('현재 순자산2,000만원은 확인된 분석 범위의 현금에서 확정 채무0을 차감한 값이다. 현금 안의 보호600만원·운영200만원·교육비 준비200만원은 같은 현금의 목적 표시다. 별도 자산으로 다시 더하거나 각각을 지출로 차감하지 않는다. 미배정 현금은1,000만원이지만 전체가 개인화 투자 권장액이 되는 것은 아니다.')
table(['월 흐름의 단계','금액 만원','해석'],[
 ('월 세후소득','500','세후·동일 월 기준'),('생활비 차감 후','300','500 − 200'),('의무상환 후','300','채무 없음이 확인된 가정'),('유지납입 후','250','기존50을 현금에서 비현금으로 이동'),('교육비 추가준비 후','150','월100을 목표 현금으로 표시한 뒤의 잔여 예산')],[70,28,68])
p('보호 목표는 필수 생활비와 의무상환을 합한 금액의3개월분과 고객 확인 목표 중 큰 값이다. 운영 목표는1개월분과 고객 확인 목표 중 큰 값이다. 이 사례의 보호600·운영200만원은 이미 확보되어 있어 추가 보충을 매월 다시 차감하지 않는다. 서비스 정책의 초기 기준이며 모든 가구에 충분한 안전금액이나 법정 기준이라는 의미는 아니다.')
q=p('보호·운영·목표·유지납입의 배정은 DION-ALLOCATION-1.0을 적용한다. 현금 보존식과 목표별 달력은 독립 엔진의 계약을 따른다.');foot(q,'통합본 Library v5, docs/planning-engine-v1/contract.md 4~6절 및 backend/app/planning. 엔진 DION-ENGINE-1.0, 질문 실행정의1.3-engine.')
h('교육비의 필요 적립액')
p('교육비500만원에서 준비금200만원을 뺀300만원을 지급 전에 가능한3회에 나누면 월100만원이다. 적립일은 지급일보다 앞서며, 월100만원은 현금 안의 교육비 목적 표시다. 2월28일 실제 지급500만원을 반영할 때 준비금 적립을 또 한 번 비용으로 차감하지 않는다.')
p('현재 판단 가능한 것은 선언한 조건의 월 예산이다. 지급일보다 월급 입금일이 늦을 수 있으므로 월흑자를 하루 단위의 지급능력으로 확정하지 않는다. 은퇴생활비·연금·추가세금이 미확인인 상태도 숫자0으로 채우지 않는다.')

page('4단계 재무설계안 수립 및 제시')
p('두 후보는 소득·생활비·목표·유지납입·보호 조건을 동일하게 둔다. 차이는 잔여 신규 예산150만원 중 신규투자 검토에 배정하는 정책 템플릿50%와80%다. 자기보고 투자선호5단계나 구성3유형을 이 비율로 치환하지 않는다.')
table(['첫 달 월 배분 만원','생활 안정 우선','투자 여력 확대'],[
 ('생활비','200','200'),('기존 유지 투자납입','50','50'),('교육비 추가준비','100','100'),
 ('신규투자 검토 후보',m(C[0]['rows'][0]['new_investment_krw']),m(C[1]['rows'][0]['new_investment_krw'])),
 ('추가 현금 유지',m(C[0]['rows'][0]['additional_cash_krw']),m(C[1]['rows'][0]['additional_cash_krw'])),
 ('월 배분 합계','500','500'),('실제 권장액과 채택액','미확정','미확정')],[76,45,45])
h('전망 결과와 대사')
table(['3개월 뒤 금액 만원','생활 안정 우선','투자 여력 확대'],[
 ('교육비 지급 뒤 현금',m(C[0]['final_cash_krw']),m(C[1]['final_cash_krw'])),
 ('기존·신규 납입으로 증가한 투자자산','375','510'),
 ('현금과 투자자산을 합한 순자산',m(C[0]['final_net_worth_krw']),m(C[1]['final_net_worth_krw']))],[76,45,45])
p('현금은 초기2,000에3개월의 소득을 더하고 생활비·유지납입·신규투자·교육비 실제 지급을 뺀다. 안정 후보는2,000 + 3×(500−200−50−75) − 500 = 2,025만원이다. 확대 후보는 같은 식의75를120으로 바꾸면1,890만원이다. 납입은 자산 내부 이동이므로 두 후보의 무수익 순자산은 모두2,400만원이다.')
p('투자예산 상한 전용 결과 필드는 이 엔진 응답에 제공되지 않는다. 화면이 잔여 예산을 임의로 권장액으로 재계산하지 않도록 상한은 미제공, 비교 후보는75/120만원, 실제 권장액은 미확정으로 구분했다. 생활 안정 후보는 현금을 더 유지하지만 고객의 공식 선택으로 기록하지 않았다.')

page('5단계 재무설계안 실행')
p('아래는 가상 사례의 실행 순서다. 교육비 적립과 필요한 확인 행동을 금액·기한·담당에 연결하되, 실제 자동이체나 투자매매를 수행하지 않았다. 적합성 미검증 후보를 채택 가능한 완성안으로 표시하지 않는다.')
table(['우선 행동','금액과 기한','담당과 완료 확인'],[
 ('1 교육비 준비','100만원, 첫2026-12-15. 이후1월15일·2월15일','가상 가구. 별도목적 잔액과 지급액500만원을 대조'),
 ('2 지급 전 자료 확인','금액 확인 대기, 2026-12-14까지','가상 가구. 실제 입금일·인출제약·잔액 확인 후 지급 가능성 재검토'),
 ('3 은퇴와 연금 자료 확인','예상액 미확정, 2026-12-31까지','가상 가구. 공식 예상액·조회일·세후 기준·은퇴생활비 확인')],[43,59,64])
p('자료 확인 뒤에도 신규투자는 후보 비교 단계다. 투자선호 P1~P5는 자기보고 정보이고, A안정 보완·B균형 운용·C성장 비중은 별도 구성 체계다. 연령이나 두 재무안 선택만으로 구성을 확정하지 않는다. 신규자금부터 검토하고, 기존 금융자산의 매도·변경은 필요와 비용을 별도 확인한다. 보유 부동산은 기본 유지한다.')
p('대표 데모는 아래 화면과 같은 저장 결과를 읽는다. 과거 결과를 열면 저장 버튼을 막아 최신 입력과 혼동하지 않게 했고, 새 계산은 새 스냅샷으로 남긴다.')
pic('representative-plans.jpg',151)
caption('그림 1 기본 사례의 두 검토 후보. 기준일2026-11-30, 입력v12. 실제 권장·채택·거래 상태와 구분한다.')

page('6단계 재무설계안 점검')
p('실제 브라우저에서 최초 입력과 목표분기를 확인하고 원응답 저장, 계산, 금액과 기한이 있는 행동을 표시했다. 월소득을500에서520만원으로 수정하자 새로운 입력v13으로 계산되고, 과거v12의 원문과 숫자는 유지되었다. 이어 소득을 미입력으로 비워v14를 저장했을 때 순자산2,000만원은 유지되고 월 흐름과 월 후보는 보류되었다.')
table(['점검 항목','기본 v12','수정 v13','비움 v14'],[
 ('원문 소득 만원','00500.0000','00520.0000','null / NOT_ENTERED'),
 ('첫 달 신규투자 후보','75 / 120','85 / 136','미확정'),
 ('3개월 뒤 현금','2,025 / 1,890','2,055 / 1,902','미확정'),
 ('3개월 뒤 순자산','2,400 / 2,400','2,460 / 2,460','미확정'),
 ('확인 현재 순자산','2,000','2,000','2,000')],[52,38,38,38])
p('별도 프로세스 재실행에서 동일 저장결과 ID와 입력해시를 복원했다. 브라우저를 새로 고쳐도 마지막 원상태 NOT_ENTERED가 모름과 구분되어 표시된다. 계산에서는 UNKNOWN으로 매핑하지만 원응답의 비우기 상태는 보존한다. 숫자 문자열00300.0000의 원문 왕복도 별도 연결 검사에서 통과했다.')
h('월간 기록의 별도 표시 경계')
p('FAST-DEMO-02는 대표 가구 B01과 다른 예시다. 소득300·생활비150·상환20·목표20·기존투자40·신규투자30·비상20·추가현금20이라는 월계획을 가진다. UI-INV-01의 기존납입0·목표미확정·월110 전제와 합치지 않는다.')
table(['기록 항목','표시와 판단'],[
 ('할일3/4','75%. 금액 납입완료와 별개의 완료 기록이다.'),('투자 미입력','계획 차이 미확정. 명시 실제0일 때만−30만원으로 대사한다.'),
 ('11월1~10일 생활비95','월150 대비 현재 남은 예산55만원. 한 달 절약 실적이 아니다.'),
 ('일시금400','FAST-20261110-01:execution:lump-1, 기준일11월10일, 실행 대기. 넓은·좁은 화면이 같은 기록을 읽는다.')],[43,123])
p('월말에는 전체 기간 기록·증빙·변경 사유를 받은 뒤 재점검한다. 가상 월간 기록을 실제 한 달 운영 성과로 발표하거나 실제 고객 대화를 만들어 넣지 않는다.')

page('장기 시나리오와 실행 전 확인')
p('현재 수치가 이어지는 기간은2026-12~2027-02의3개월이다. 은퇴는 장기 후속 시나리오로 분리했다. 예상연금·은퇴생활비·다른 세후소득·수령 시작과 종료·자산 인출 조건을 받은 뒤 은퇴 후 부족액을 계산한다. 현재 자료가 없으므로 수급액·세율·미래수익률·성공확률을 생성하지 않았다.')
table(['지원 수준','이번 사례의 적용'],[
 ('현재 상태·목표·월 후보','확인 범위의 독립 엔진 계산을 로컬 데모로 연결했다.'),
 ('세금','확인된 세액과 사건 입력 범위. 법정 세율·공제 자동산출은 비활성이다.'),
 ('연금','공식 예상액 또는 명시 가정의 후속 시나리오. 법정 수급액 자동산출은 하지 않는다.'),
 ('상속','미확정 수령은 현재 투자재원에서 제외한다. 법정 배분·상속세를 산출하지 않는다.'),
 ('저장·복원','POC-RAW-0.1 SQLite와 모의 호출자. 실제 인증·운영 DB·기존 Next/FastAPI 연결 완료가 아니다.'),
 ('투자·실행','상품별 적합성·비중 권고·계좌연동·금융거래·실제 채택·운영성과는 미완료다.')],[43,123])
h('검증으로 확인한 범위')
p('이번 작업에서 원응답 PoC29검사, 독립 엔진의2사례16금액검사, 새 연결12검사를 직접 실행했다. 브라우저에서는 빠른5뷰·정밀5뷰 이동, 목표 있음/없음의6/4개 컨트롤, 입력 수정·복원과 부분결과를 확인했다. 좁은 화면은 CSS449px 조건이며 실제 휴대전화 기기 검사는 아니다. 사용자 소요시간과 최초 입력 전체 중첩필드의 실측은 남아 있다.')
p('이 검사는 프로그램이 계약대로 움직이는지와 고정 입력의 산술을 확인한다. 현금흐름의 현실성, 가구의 필수생활비 충분성, 미래의 세금·연금·상품 적합성은 별도의 금융 검토가 필요하다. 전체 pytest253개 통과는 기존 인계문서의 기록이며 이번 환경에는 pytest가 없어 재실행하지 않았다.')
q=p('문서와 화면의 기준 결과는 '+S['raw_snapshot_id']+'이며, 수정 결과는 별도 ID로 보관한다. 표·차트·문서가 입력해시를 공유하는지 검사하고, 알려진 제한과 재현방법을 선택 제출 ZIP에 동봉한다.');foot(q,'선택 제출 자료: docs/submission/2026-11-10/evidence/initial-snapshot.json, revised-snapshot.json, partial-snapshot.json. 문서에 기록한 결과 ID로 같은 입력·버전을 추적한다.')


q=p('AI 활용 기술서 부록','Title');q.paragraph_format.page_break_before=True
h('1 사용한 AI 도구')
table(['도구명','버전 및 요금제','주요 사용 목적'],[
 ('ChatGPT Work의 Codex','GPT-6 기반 에이전트. 세부 배포버전·요금제는 참가자 확인 대상','파일 대조·화면 구현·연결 검사·문서 초안과 오류 교정'),
 ('결정적 Python 엔진','DION-ENGINE-1.0, AI 모델 아님','금액 계산. AI 응답과 구분하기 위해 함께 기재')],[41,58,67])
p('기존 프로젝트가 사용한 다른 AI 도구나 과거 프롬프트의 전수 기록은 이 작업에 제공되지 않았다. 아래는 본 대화에서 확인 가능한 실제 지시·응답·검증 기록이다. 과거 AI의 발언이나 참가자 본인이 직접 검증했다고 확인되지 않은 활동을 만들어 적지 않았다.')
h('2 AI 활용 내역')
table(['활용 단계','입력한 프롬프트','AI 응답 요약','본인의 판단 및 수정','산출물'],[
 ('자료수집·분석','다음쪽 원문의 기존5+5뷰·시안재사용 조건','통합본v5의 기존 엔진 재사용을 제안','AI보조 검토: 정책 변경 없이 로컬 연결만 구현. 참가자 최종 확인 전','실행 데모·지원표'),
 ('설계안·점검','다음쪽 원문의 후보 구별·원문 보존·복원 요구','월75/120 후보, 수정·복원 검사 결과를 설명','독립 금액16개와 대조. 실제 권장·채택과 구별','두안 비교·스냅샷'),
 ('최종 작성','다음쪽 원문의 공식 양식·AI 부록 요구','사례와 실제 AI기록을 단일 문서로 작성','이번 대화 기록만 수록. 과거 도구 이력·최종 열람·서명은 참가자 확인','단일DOCX')],[25,38,34,46,23])
h('실제 AI 응답 발췌')
for t in [
 '“기준 통합본 v5에 독립 엔진이 있어 계산은 그대로 재사용할 수 있습니다. 기존 API·화면은 아직 연결되지 않았으므로, 담당 폴더 안에 로컬 데모를 추가해 원응답 저장 PoC와 엔진을 연결하겠습니다.”',
 '“새 연결 검사 12건이 통과했습니다. 최초 저장·수정 재계산·별도 프로세스 복원, 중복 요청·오래된 수정 거절, `00300.0000` 원문 보존을 확인했습니다. 소득을 미입력으로 바꿔도 확인된 자산 결과가 남습니다.”']:p(t)
p('위 발췌의 실제 응답은 evidence/actual-ai-response.txt에 보존했다. 참가자의 독립 검증을 대신하는 서술이 아니라 AI 보조 작업의 실제 기록이다.')

page('주요 프롬프트 원문')
p('아래는2026-11-10 본 대화에서 입력된 지시문 원문이다. 코드와 보고서에 영향을 준 조건을 생략하지 않았다.')
for t in (HERE/'evidence/actual-prompt.txt').read_text().split('\n\n'):p(t.strip())

page('3 검증 및 수정 내역')
p('AI가 생성한 코드도 검증 대상에 포함했다. 실제 실패와 수정 전후를 남기고, 원본 시안의 문제를 과거 AI의 특정 발언으로 꾸며 인용하지 않았다.')
table(['AI 제시 내용 또는 산출물','검증 방법과 근거','발견한 문제','수정 결과'],[
 ('가구용 데모 입력 생성 코드','첫 브라우저 저장. 오류 NEW-01 and context scope disagree; 원문과 단위 대조','NEW-01은personal인데 context는household. 금액 변환 후 일부unit이KRW로 남음','scope를명시 일치시키고 금액필드unit을KRW_10000으로 보정. 독립 금액16개 및 연결 기본정답 대조'),
 ('원상태를 엔진 입력으로 다시 채운 화면','v14 저장 후 재접속. 원응답 NOT_ENTERED와 화면의 모름 표시 대조','계산용UNKNOWN을 비우기 원상태와 혼동','화면은 저장된 원문을 읽고 계산에만 매핑. 재접속 후 미입력 또는 비우기 표시 확인'),
 ('원본의67%, 투자차이−30, 월절약55','기존 original.html 및 적용 전 README와 월간 fixture 대조','할일 비율과 미입력·중간기록의 해석 오류','75%, 미확정, 현재 남은 예산55로 표시. 실제0과 비우기 별도 검사'),
 ('월75/120과 성공 주장','기존 엔진 원장·독립정답·OUT-06 상태 확인','후보를 권장액·성공확률로 오해할 위험','후보·상한 미제공·권장액 미확정 분리. 채택 차단, 근거 없는 확률·인증·사업자 표시 제거')],[43,44,34,45])
p('검증의 주체도 구분했다. 위 항목은 이 에이전트가 수행한 자동검사와 브라우저 관찰이다. 최종 참가자는 원문 지시, 코드 수정과 결과를 직접 확인하고 제출 여부를 판단해야 한다. 참여자가 검토하지 않은 내용을 본인의 검토 완료로 바꾸어 쓰지 않는다.')

page('4 종합 기술')
p('AI가 유용했던 지점은 분산된 화면·계산·저장 자료의 차이를 찾고, 같은 스냅샷으로 화면과 문서가 이어지게 한 과정이다. 기존 시안을 그대로 완성 서비스로 보여주지 않고 실제로 연결한 저장과 계산 범위만 표시했다. 금액은 독립 엔진이 계산하며 AI 문장이 결과나 배정정책을 덮어쓰지 않는다.')
p('실제로 가구 범위가 맞지 않은 입력은 저장 전에 거절되었다. 코드가 실행된다는 이유만으로 자료 의미가 옳다고 보지 않고, 선언 단위와 범위까지 고정 정답에 대조했다. 이후 미입력의 원상태가 화면에서 모름으로 바뀌는 오류도 발견해 표시의 데이터 출처를 수정했다. 이 두 교정은 성공 화면만 제시하는 것보다 AI 보조 작업의 검증 한계를 분명히 보여준다.')
h('코드 검사와 금융 검토의 구분')
table(['증거','확인한 범위','확인하지 못하는 범위'],[
 ('PoC29검사','원응답·수정이력·중복·동시성 거절·복원','실제 인증·운영 보안·실고객 동의'),
 ('독립 금액16개','가상2사례와 엔진 결과의 금액 대사','정책의 최적성·상품 적합성·법률 타당성'),
 ('연결12검사','저장과 실제 엔진 호출·수정·재시작·상태 보존','전체제품55질문 UI·실계좌 연동·모든기기'),
 ('브라우저 관찰','6/4개 컨트롤, 두안·부분결과·복원·CSS449px','실사용자 입력시간·모든중첩필드·휴대전화 실기기')],[35,65,66])
p('보호3개월·운영1개월과 잔여 예산50%/80%는 기존 프로젝트가 정한 초기 서비스 정책이다. 이 사례는 그 정책의 일관된 적용과 보존식을 확인한다. 모든 가구에 적합하거나 투자성과를 보장한다는 금융 검증 결론은 내리지 않았다. 공식 세법이나 수급액을 자동 산출한 것으로도 표현하지 않는다.')
q=p('공식 FAQ는 사용 프롬프트와 AI 정보를 어떻게 검토·수정했는지를 설명하도록 안내한다. 이 부록은 실제 기록과 검증을 묶고, 제공되지 않은 과거 도구 이력은 남은 확인 대상으로 표시했다.');foot(q,'한국재무설계협회 FAQ, 2026-11-10 열람. https://ifpk.org/?data_usn=181826&mnu_usn=67&mode=view&page_no=1')
p('별도 도구는 표준 라이브러리의 로컬 시연 서버와 기존 엔진·PoC를 호출한다. 실행 명령, 필요한 원본 버전, 정상·누락·수정 사례, 캡처와 제한을 ZIP에 포함했다. 실제 고객의 채택이나 한 달 운영 성과를 증명하는 도구로 제시하지 않는다.')

# Native footnotes keep source references with the relevant claims.
root=OxmlElement('w:footnotes')
for ident,kind in [(-1,'separator'),(0,'continuationSeparator')]:
 f=OxmlElement('w:footnote');f.set(qn('w:id'),str(ident));f.set(qn('w:type'),kind);pa=OxmlElement('w:p');ru=OxmlElement('w:r');ru.append(OxmlElement('w:'+kind));pa.append(ru);f.append(pa);root.append(f)
for i,text in enumerate(NOTES,1):
 f=OxmlElement('w:footnote');f.set(qn('w:id'),str(i));pa=OxmlElement('w:p');pp=OxmlElement('w:pPr');sp=OxmlElement('w:spacing');sp.set(qn('w:line'),'360');sp.set(qn('w:lineRule'),'auto');pp.append(sp);jc=OxmlElement('w:jc');jc.set(qn('w:val'),'left');pp.append(jc);pa.append(pp)
 ru=OxmlElement('w:r');rp=OxmlElement('w:rPr');fonts=OxmlElement('w:rFonts');fonts.set(qn('w:ascii'),'맑은 고딕');fonts.set(qn('w:hAnsi'),'맑은 고딕');fonts.set(qn('w:eastAsia'),'맑은 고딕');rp.append(fonts);sz=OxmlElement('w:sz');sz.set(qn('w:val'),'20');rp.append(sz);ru.append(rp);tx=OxmlElement('w:t');tx.text=' '+text;ru.append(tx);pa.append(ru);f.append(pa);root.append(f)
for key,rel in list(D.part.rels.items()):
 if rel.reltype==RT.FOOTNOTES: del D.part.rels[key]
part=Part(PackURI('/word/footnotes.xml'),'application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml',etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True),D.part.package);D.part.relate_to(part,RT.FOOTNOTES)
# Metadata contains no participant identity.
D.core_properties.author='';D.core_properties.last_modified_by='';D.core_properties.title='DION 재무설계 사례와 AI 활용 기술서';D.core_properties.subject='B안 가상 고객 사례';D.core_properties.comments=''
D.core_properties.keywords='source_snapshot='+S['raw_snapshot_id']+';input_sha256='+S['engine_output']['input_sha256']
output=HERE/'B안_DION_참가작.docx';D.save(output)
manifest={'official_template_sha256':hashlib.sha256(args.template.read_bytes()).hexdigest(),'snapshot_id':S['raw_snapshot_id'],'input_sha256':S['engine_output']['input_sha256'],'revised_snapshot_id':V['raw_snapshot_id'],'partial_snapshot_id':U['raw_snapshot_id'],'page_plan':{'body':7,'appendix':4},'font':'맑은 고딕','large_title_pt':13,'subheading_pt':11,'body_pt':10,'line_spacing':1.5,'margins_mm':[20,20,20,20],'participant_identity_in_body':False,'filename_requires_participant_rename':True,'signature':'NOT_SIGNED_BY_AGENT'}
(HERE/'evidence/document-source.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
print(output)
