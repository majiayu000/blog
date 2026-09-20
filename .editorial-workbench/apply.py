"""One-off editorial applicator. Removed with its data after successful validation."""
from pathlib import Path
import collections
import html
from html.parser import HTMLParser
import json
import re
import subprocess

BASE = '5e84e274a21cd47aae3f0989a5a7f3a0185cbef4'
MAIN = '7228c239fb8d3e9e207131e02da7c21d07aa7181'
ROOT = Path('src/posts')
BLOCK = re.compile(r'<(p|h[1-6]|title|figcaption)\b[^>]*>([\s\S]*?)</\1>')
PROTECTED = re.compile(r'<(pre|style|script)\b[^>]*>[\s\S]*?</\1>', re.I)

def outside(source, fn):
    out, cursor = [], 0
    for m in PROTECTED.finditer(source):
        out.extend([fn(source[cursor:m.start()]), m.group(0)])
        cursor = m.end()
    out.append(fn(source[cursor:]))
    return ''.join(out)

def literals(source, pairs):
    for old, new in pairs:
        if old not in source:
            print('Optional literal absent:', old[:90])
            continue
        source = outside(source, lambda s, a=old, b=new: s.replace(a, b))
    return source

def element_containing(source, tag, marker, replacement):
    pattern = re.compile(r'<' + tag + r'\b[^>]*>[\s\S]*?</' + tag + r'>', re.I)
    hits = [m for m in pattern.finditer(source) if marker in m.group(0)]
    if len(hits) != 1:
        raise ValueError(f'{tag}: expected one element containing {marker!r}, got {len(hits)}')
    m = hits[0]
    return source[:m.start()] + replacement + source[m.end():]

class Structure(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids=[]; self.assets=[]; self.metadata={}; self.starts=collections.Counter(); self.ends=collections.Counter()
    def handle_starttag(self, tag, attrs):
        a=dict(attrs); self.starts[tag]+=1
        if 'id' in a: self.ids.append(a['id'])
        if tag in {'img','video','audio','source','script','link'}:
            self.assets.append((tag, tuple((k,a[k]) for k in ('src','srcset','poster','href','width','height') if k in a)))
        if tag=='meta' and a.get('name') in {'date','tags','updated','draft','featured'}:
            self.metadata[a['name']]=a.get('content')
    def handle_startendtag(self,tag,attrs): self.handle_starttag(tag,attrs)
    def handle_endtag(self,tag): self.ends[tag]+=1

def external_links(source):
    result={}
    for m in re.finditer(r'<a\b[^>]*href=[\"\'](https?://[^\"\']+)[\"\'][^>]*>([\s\S]*?)</a>',source,re.I):
        result[html.unescape(m.group(1))]=re.sub(r'<[^>]+>','',m.group(2)).strip()
    return result

def cleanup(slug,s):
    if slug=='codeagent-how-handles-video':
        for marker in ['四家都不会「直接把 mp4', 'Codex 强的是', '别问「哪个 Code Agent']:
            s=element_containing(s,'blockquote',marker,'')
        s=element_containing(s,'ol','它确实不会','')
        s=re.sub(r'<div class="foot">[\s\S]*?</div>', '<div class="foot">2026-08-04 · Silent Star<br>本机 MP4 对照：直接读取失败，ffmpeg 导出的六帧联系表可通过图片入口读取。</div>',s)
        s=literals(s,[
          ('白话成稿','源码与本机对照'),('用白话讲','检查位置'),('白话名字','检查对象'),
          ('0 · 一个念头','0 · 从 MP4 输入开始'),('1 · 先说结论','1 · 检查范围'),
          ('4 · 生成、播放会不会冒充理解','4 · 生成、播放与分析'),('6 · 其它细节往哪搁','6 · 抽帧会损失什么'),
          ('结论：四家都不会「直接看视频」','本文检查的输入路径：文字与图片'),
          ('差在：格式允不允许 · 读文件时怎么挡 · 有没有生成/播放把场面做大','分别检查请求内容、读文件工具和生成 / 播放入口'),
          ('第一块 · 最重要','请求内容'),('第二块 · 日常体感','读文件工具'),('第三块 · 容易误会','产品入口'),
          ('门在格式上就锁了','未见视频内容块'),('四家答案一样：没有','范围限于本文检查的代码'),
          ('Codex：官方不看，可换路','Codex：先抽帧再读图'),('都不会自动截帧给模型','未见默认自动抽帧流程'),
          ('靠「不看视频也能完成」的办法，不是靠看懂了 mp4','本次实测：ffmpeg 抽帧，再经图片入口识别'),
          ('当前会话的新鲜结果','本次测试结果'),('拒绝最响','明确返回二进制错误'),
          ('不报视频错，也不会看','本次直接读取失败'),('差在挡法和热闹程度','差在工具处理与产品入口'),
          ('嘴上「看过」（坏）','缺少画面证据的描述'),('根据文件名瞎编','仅依据文件名推测'),
          ('没图没帧却描述细节 → 打回','检查描述能否追溯到画面输入'),
          ('生成/播放「演得很真」','生成与播放入口容易混淆'),
          ('第一块','请求格式'),('第二块','文件工具'),('第三块','产品入口')])
    elif slug=='context-compaction-3way':
        for marker in ['严谨科技报告','核心结论(金字塔顶)','三者对「压缩时是否','Pi 把会话建模成','三者把压缩的','MECE 结论']:
            s=element_containing(s,'blockquote',marker,'')
        s=element_containing(s,'blockquote','实验数据(compact.ts', '<blockquote>源码注释（compact.ts:431–434）记录过关闭 fork 缓存共享后的缓存变化，涉及 98% cache miss、约 0.76% cache_creation 和约 380 亿 token/天。这些数字是实现注释中的历史背景，本文没有复现测量。</blockquote>')
        s=literals(s,[
          ('附完整源码','关键源码节选'),('金字塔原理','源码对照'),('金字塔','源码对照'),
          ('支柱一 · 缓存取舍','摘要请求 · 缓存'),('支柱二 · 结构取舍','会话历史 · 保留'),('支柱三 · 边界取舍','调用入口 · 扩展'),
          ('次级事实归位(MECE 校验)','触发阈值与错误恢复'),('次级事实归位','触发阈值与错误恢复'),
          ('纵向完整机制','各系统调用顺序'),('参数趋同是表象,本质是三个取舍上的不同下注','从摘要请求、历史保留和调用入口检查实现差异'),
          ('本质差异 = 三个根本取舍:','源码阅读角度：'),(' —  参数(触发阈值 / token 估算 / 摘要格式)三家高度趋同',' —  触发阈值与错误恢复另列'),
          ('影响面最大','请求构造'),('能力天花板','历史组织'),('谁能演进','接口位置'),
          ('全力复用','共享请求参数'),('fork 共享前缀,压缩也命中(省 98% miss)','fork 沿用主对话参数，命中率未测'),
          ('主动放弃','独立缓存设置'),('前缀保护','超限重试'),('超限从头部删,保后续 turn 缓存','移除最旧项，保留近期内容'),
          ('Pi  ★ 唯一','Pi'),('四层 + 熔断,能力最全但改不动','客户端内置编排与错误恢复'),
          ('四路,能推服务端就推','按开关和 provider 分派'),('成本敏感 → Claude Code','请求参数 → Claude Code'),
          ('开箱即用的最优','客户端内置编排'),('支柱一','缓存'),('支柱二','历史'),('支柱三','入口'),
          ('开源完整可读','对应公开源码可查'),('泄露版可读代码全覆盖','所用可读代码已定位主要路径'),
          ('最新版仅二进制字符串验证','补充版本仅做二进制字符串检查')])
    elif slug=='glm52-k3-deepseekv4-training':
        s=element_containing(s,'li','后训练吃掉了总算力', '<li><strong>K3 表内后训练占总 FLOPs 约 75.6%。</strong>1,190,757,067 / 1,575,421,683 ≈ 75.6%；按 PFU-days 计算也约为 75%。这个比例限于该报告的阶段划分。</li>')
        s=element_containing(s,'li','后训练的 token 量几乎等于', '<li><strong>后训练与预训练的 token 量接近（14.6T 与 15.6T），每 token 对应计算量不同。</strong>按表内口径推算，分别约为 2.2e11 和 6.7e10 FLOPs/token。RL 中的采样与多次前向可能参与这一差异，但表格没有单独拆出各项贡献。</li>')
        s=element_containing(s,'li','后训练 MFU 只有 27%', '<li><strong>K3 后训练 MFU 为 27%，预训练为 54%。</strong>两者相差一半。要判断环境等待、rollout 和调度分别造成多少损失，还需要阶段内的性能剖析。</li>')
        s=element_containing(s,'ul','架构趋同，竞争转移', '<p>K3 的账本给出了后训练计算量、利用率与合成数据占比，V4 的材料进一步涉及环境规模与评分要求。它们可以帮助确定下一步该查哪些训练成本，但目前没有同口径数据可比较三家的总效率。</p><p>对部署与选型，仍要回到任务表现、许可证、资源需求和可复现材料。报告中的一个高比例或一条上升曲线，只回答其对应实验的问题。</p>')
        s=element_containing(s,'blockquote','修正：我早先写', '<blockquote>更正：K3 Table 1 和 Table 4 已列出语料构成与 token 账本，早先“未披露数据量”的表述不准确。本文据此补入表格。</blockquote>')
        s=literals(s,[
          ('最大亮点','可对照的设计'),('全行业最大的效率洼地','该报告中需要解释的效率差异'),
          ('所有数字均来自三份技术报告原文','表格沿用三份技术报告的摘录'),('我尽量逐项核对','提取缺口和存疑字段列于下方'),
          ('FP4 几乎无损','该消融中 FP4 与 FP8 PPL 接近'),('原稿摘录','本文摘录'),('原稿记录','材料记录')])
    elif slug=='bill-gates-basic-to-2045':
        s=element_containing(s,'div','1 月巴菲特停止捐赠', '<div class="d">6 月 10 日，盖茨接受众议院委员会询问。相关陈述与报道见本文争议部分。</div>') if False else s
        # Target only leaf timeline descriptions; never match an enclosing layout div.
        s=re.sub(r'<div class="d">1 月巴菲特停止捐赠[\s\S]*?</div>', '<div class="d">6 月 10 日，盖茨接受众议院委员会询问；相关陈述与来源见争议部分。</div>',s)
        s=re.sub(r'<div class="d">1 月基金会更名 Gates Foundation[\s\S]*?</div>', '<div class="d">5 月 8 日公布基金会于 2045 年结束运营的计划；10 月 28 日公开发表气候与发展文章。</div>',s)
        s=element_containing(s,'li','Wikipedia:Gates Foundation','<li><strong>Wikipedia:Gates Foundation</strong>——用于定位基金会沿革与项目资料；期限安排另见正文链接的 2025 年官方公告。财务数字按原稿所列年份阅读，未重新审计。</li>')
        s=literals(s,[
          ('全球最大私人基金会主席','盖茨基金会'),('第一幕 · 软件帝国','微软时期'),('第二幕 · 慈善帝国','基金会工作'),
          ('第一幕开幕','微软成立'),('第二幕开幕','职责调整'),('功绩总览','经历概览'),('MS-DOS 豪赌','DOS 授权'),
          ('六大产物解析','产品与组织安排'),('同侪坐标','合作与竞争'),('暗面与争议','公开争议'),
          ('2045 年的日落','2045 年的停止运营计划'),('巴菲特同日宣布','巴菲特同年宣布'),
          ('12 月与巴菲特、梅琳达共同发起','与巴菲特、梅琳达共同发起'),
          ('图形界面第一次真正大卖,奠定 Windows 王朝;次年 Windows NT 项目启动。','Windows 3.0 发布，Windows 的采用范围扩大。'),
          ('2026 年终止时估算','原稿累计估算，未重新审计'),('原稿列出的野生脊灰病例比较','下面的野生脊灰病例比较'),
          ('采用流传最广的版本','按所列来源保留记述，未独立验证')])
    elif slug=='codex-computer-history':
        s=element_containing(s,'li','segmentDurationSeconds','<li><code>segmentDurationSeconds</code> 表示滚动段时长。实际值在运行时配置中，本次没有从事件记录确认；<code>tenMinuteSummaryTasks</code> 这个名称不能单独确定每段的长度。</li>')
        s=literals(s,[
          ('字段有，运行时才填；上界是 10 分钟摘要','字段可见，实际值未从运行记录确认'),
          ('完整（asar）','已定位客户端代码'),('完整；JSON Schema 原文未嵌入二进制','工具名与文案已定位；JSON Schema 未取得'),
          ('完整（<code>__swift5_reflstr</code>）','已定位反射字段'),('完整（reflstr 字段表）','已定位字段表'),
          ('完整到管线；模型名/超时秒数未出现在字符串里','已定位组件；模型名与超时值未确认'),
          ('<td>完整</td>','<td>已定位相关配置或字符串，未实测</td>')])
    return s

edits={}
for file in sorted(Path('.editorial-workbench').glob('part*.json')):
    data=json.loads(file.read_text())
    for slug, patch in data.items():
        target=edits.setdefault(slug, {'blocks': {}})
        target['blocks'].update(patch.get('blocks',{}))
        if 'description' in patch: target['description']=patch['description']
assert len(edits)==14, len(edits)
posts=sorted(ROOT.glob('*/index.html'))
assert len(posts)==19, len(posts)
validation=[]
for path in posts:
    original=path.read_text()
    expected=subprocess.check_output(['git','show',f'{BASE}:{path.as_posix()}']).decode()
    assert original==expected, f'Concurrent article change: {path}'
    slug=path.parent.name
    if slug not in edits: continue
    patch=edits[slug]; nodes=list(BLOCK.finditer(original)); changes=[]
    for index, value in patch['blocks'].items():
        m=nodes[int(index)]
        if value is None:
            assert m.group(1)=='p' and 'id=' not in m.group(0).split('>')[0]
            changes.append((m.start(),m.end(),''))
        else: changes.append((m.start(2),m.end(2),value))
    s=original
    for start,end,value in sorted(changes,reverse=True): s=s[:start]+value+s[end:]
    if 'description' in patch:
        s,count=re.subn(r'(<meta\b[^>]*name="description"[^>]*content=")[^"]*(")',lambda m:m[1]+html.escape(patch['description'],quote=True)+m[2],s,count=1)
        assert count==1, f'Missing description {slug}'
    s=cleanup(slug,s)
    before_links=external_links(original); after_links=external_links(s)
    missing={u:t for u,t in before_links.items() if u not in after_links}
    if missing:
        links=' · '.join('<a href="'+html.escape(u,quote=True)+'">'+html.escape(t or u)+'</a>' for u,t in missing.items())
        assert '</main>' in s
        s=s.replace('</main>','<p>补充来源：'+links+'</p>\n</main>',1)
    assert [m.group(0) for m in PROTECTED.finditer(original)]==[m.group(0) for m in PROTECTED.finditer(s)],f'Protected code/style changed: {slug}'
    a,b=Structure(),Structure();a.feed(original);b.feed(s)
    assert a.ids==b.ids,f'ID changed: {slug}'
    assert a.assets==b.assets,f'Asset reference changed: {slug}'
    assert a.metadata==b.metadata,f'Publication metadata changed: {slug}'
    for tag in ('html','head','body','main'):
        assert a.starts[tag]==b.starts[tag] and a.ends[tag]==b.ends[tag],(slug,tag)
    assert set(before_links)<=set(external_links(s)),f'Source link removed: {slug}'
    assert s!=original
    path.write_text(s)
    validation.append({'slug':slug,'edited_blocks':len(changes),'old_bytes':len(original.encode()),'new_bytes':len(s.encode()),'protected_blocks':len(PROTECTED.findall(s)),'retained_source_links':len(before_links)})
for slug in ['bun-14-mac-bench','codex-blender-editable-tank']:
    path=ROOT/slug/'index.html'
    assert path.read_bytes()==subprocess.check_output(['git','show',f'{MAIN}:{path.as_posix()}'])
Path('/tmp/editorial-validation.json').write_text(json.dumps({'reviewed':19,'newly_edited':14,'inherited_edits':3,'unchanged':2,'checks':validation},ensure_ascii=False,indent=2))
report=Path('.editorial-workbench/review.md').read_text()
Path('EDITORIAL_REVIEW.md').write_text(report)
print('Validated 19 articles; edited 14 beyond PR #8; code, CSS, scripts, resources and publication metadata preserved.')
