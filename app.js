const $ = (id) => document.getElementById(id);
const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => crypto.randomUUID();
const clone = (value) => JSON.parse(JSON.stringify(value));
const STORAGE = 'chaiyitiao.v1';
const demo = {
  kind: 'demo', title: '桌面整理的 3 个小方法', fileName: '桌面整理_示例.mp4', duration: 36,
  shots: [
    { id: 's1', start: 0, end: 4, visual: '俯拍杂乱的桌面，线缆与文具散落在工作区。', camera: '俯拍 · 固定镜头', speech: '桌面总是乱？试试这三个小方法。', screen: '桌面整理的\n3 个小方法', uncertainty: '', reviewed: false, approximate: false, image: 'assets/shot-1.jpg' },
    { id: 's2', start: 4, end: 10, visual: '把桌面上的物品移出，按使用频率分成三类。', camera: '俯拍 · 物品展示', speech: '第一步，把东西分成每天用、偶尔用和不常用。', screen: '01 先分类\n每天 / 偶尔 / 不常用', uncertainty: '', reviewed: false, approximate: false, image: 'assets/shot-2.jpg' },
    { id: 's3', start: 10, end: 16, visual: '将笔和便签放入收纳托盘，摆在键盘右侧。', camera: '俯拍 · 局部特写', speech: '每天用的，放在伸手就能拿到的地方。', screen: '常用物品\n就近放', uncertainty: '「伸手」两字需回看确认', reviewed: false, approximate: false, image: 'assets/shot-3.jpg' },
    { id: 's4', start: 16, end: 23, visual: '整理散乱的充电线，将线缆沿桌边收好。', camera: '俯拍 · 局部特写', speech: '第二步，给线缆一个固定的位置，桌面立刻清爽。', screen: '02 收好线缆', uncertainty: '', reviewed: false, approximate: false, image: 'assets/shot-4.jpg' },
    { id: 's5', start: 23, end: 30, visual: '在桌角摆上一盆绿植，为工作区留出一块空白。', camera: '俯拍 · 固定镜头', speech: '第三步，留一点空白，也给自己留一点呼吸的空间。', screen: '03 适当留白', uncertainty: '镜头起点为约值，需确认切换位置', reviewed: false, approximate: true, image: 'assets/shot-5.jpg' },
    { id: 's6', start: 30, end: 36, visual: '展示整理完成后的桌面，物品各就其位。', camera: '俯拍 · 全景展示', speech: '整理不是藏起来，而是让每件东西都有自己的位置。', screen: '让每件东西\n都有自己的位置', uncertainty: '', reviewed: false, approximate: false, image: 'assets/shot-6.jpg' },
  ],
  structures: [
    { id: 'c1', start: 0, end: 4, title: '用一个熟悉的问题开场', role: '提出问题', analysis: '用杂乱桌面建立具体场景，再用“三个小方法”给出观看预期。画面与问题同时出现，让观众快速知道这条视频能帮到什么。' },
    { id: 'c2', start: 4, end: 16, title: '把第一种方法拍成可见的步骤', role: '演示方法', analysis: '先分类，再展示常用物品如何就近摆放。一个观点跨越两个分镜，借助全局展示与局部细节，让方法更容易照着做。' },
    { id: 'c3', start: 16, end: 30, title: '用连续的小变化推进节奏', role: '补充方法', analysis: '收好线缆、适当留白，各对应一个具体动作。序号文字帮助观众跟上内容，桌面也在画面中逐步变得清爽。' },
    { id: 'c4', start: 30, end: 36, title: '用结果回应开场的问题', role: '展示结果', analysis: '用整洁桌面收束变化，再用一句话总结整理思路。可借鉴“开场问题—具体方法—结果呈现”的叙事顺序。' },
  ],
};
['用熟悉的问题引出观看需求。', '把抽象的整理方法转为具体的分类步骤。', '用局部画面解释常用物品的摆放方式。', '以桌面可见的变化展示第二种方法。', '用留白把实用建议连接到感受。', '展示结果，回应开头的杂乱问题。'].forEach((analysis, i) => { demo.shots[i].analysis = analysis; });
let project = clone(demo);
let selectedId = project.shots[0].id;
let tab = 'shots';
let pendingOnly = false;
let objectUrl = null;
let uploadBusy = false;
let relinking = false;
let editingId = null;
let splitSourceId = null;
let toastTimer;
let saveTimer;
let videoReady = true;
let storageOk = true;
const video = $('sourceVideo');

function formatTime(seconds, precise = false) {
  const raw = Math.max(0, Number(seconds) || 0);
  const n = precise ? Math.round(raw * 10) / 10 : raw;
  const mm = Math.floor(n / 60).toString().padStart(2, '0');
  const ss = Math.floor(n % 60).toString().padStart(2, '0');
  return `${mm}:${ss}${precise && n % 1 > .01 ? '.' + Math.round((n % 1) * 10) : ''}`;
}
function range(shot) { return `${shot.approximate ? '≈ ' : ''}${formatTime(shot.start, true)}–${formatTime(shot.end, true)}`; }
function isPending(shot) { return !!shot.uncertainty && !shot.reviewed; }
function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}
function getSaved(kind) {
  try {
    const data = JSON.parse(localStorage.getItem(`${STORAGE}.${kind}`));
    if (!data || data.kind !== kind || !Array.isArray(data.shots) || !Array.isArray(data.structures) || !Number.isFinite(data.duration)) return null;
    if (kind === 'demo') data.shots.forEach(s => { if (s.analysis === undefined) s.analysis = demo.shots.find(original => original.id === s.id)?.analysis || ''; });
    return data;
  } catch { return null; }
}
function save() {
  try {
    localStorage.setItem(`${STORAGE}.${project.kind}`, JSON.stringify(project));
    localStorage.setItem(`${STORAGE}.current`, project.kind);
    storageOk = true;
    $('saveStatus').innerHTML = icon('check') + '已保存到此浏览器';
  } catch {
    storageOk = false;
    $('saveStatus').textContent = '草稿未保存，请及时导出';
  }
}
function scheduleSave() {
  clearTimeout(saveTimer); $('saveStatus').textContent = '正在保存…'; saveTimer = setTimeout(save, 250);
}
function resizeEditors() {
  document.querySelectorAll('.cell-editor').forEach((el) => {
    if (el.closest('[hidden]')) return;
    el.style.height = '0px'; el.style.height = `${Math.max(el.scrollHeight + 3, 36)}px`;
  });
}
function counts() {
  const total = project.shots.length;
  const reviewed = project.shots.filter(s => s.reviewed).length;
  const pending = project.shots.filter(isPending).length;
  $('shotCount').innerHTML = `${total}<span>个</span>`;
  $('durationStat').innerHTML = `${Math.round(project.duration)}<span>秒</span>`;
  $('pendingStat').innerHTML = `${pending}<span>处</span>`;
  $('tabShotCount').textContent = total;
  $('pendingFilterCount').textContent = pending;
  $('reviewCount').textContent = `${reviewed} / ${total}`;
  $('reviewProgress').max = Math.max(1, total); $('reviewProgress').value = reviewed;
  $('projectNavMeta').textContent = `${project.kind === 'demo' ? '示例项目' : '本地草稿'} · ${total} 个分镜`;
}
function renderShots() {
  const rows = project.shots.filter(s => !pendingOnly || isPending(s));
  $('shotRows').innerHTML = rows.map((s) => {
    const n = project.shots.indexOf(s) + 1;
    const speechLines = Math.max(2, Math.ceil(s.speech.length / 11));
    return `<tr data-shot="${escapeHtml(s.id)}" class="${s.id === selectedId ? 'selected' : ''}">
      <td><div class="frame-index"><b>${String(n).padStart(2, '0')}</b><span>镜头</span><span>${(s.end - s.start).toFixed(1).replace('.0', '')}s</span></div><button class="frame-image-button" data-seek="${escapeHtml(s.id)}" aria-label="播放镜头 ${n}">${s.image ? `<img class="frame-image" src="${escapeHtml(s.image)}" alt="镜头 ${n} 代表画面">` : `<span class="frame-placeholder">${icon('film')}</span>`}</button><button class="time-link" data-seek="${escapeHtml(s.id)}" aria-label="跳转镜头 ${n}，${range(s)}">${range(s)}</button></td>
      <td><textarea class="cell-editor" rows="3" data-field="visual" data-id="${escapeHtml(s.id)}" aria-label="镜头 ${n} 画面与动作" placeholder="记录画面与动作">${escapeHtml(s.visual)}</textarea><button class="camera-tag" data-edit="${escapeHtml(s.id)}" title="编辑拍摄信息">${icon('film')}${escapeHtml(s.camera || '添加拍摄信息')}</button></td>
      <td><textarea class="cell-editor speech-editor" rows="${speechLines}" data-field="speech" data-id="${escapeHtml(s.id)}" aria-label="镜头 ${n} 口播原文" placeholder="添加口播原文">${escapeHtml(s.speech)}</textarea>${s.uncertainty ? `<span class="uncertainty" title="${escapeHtml(s.uncertainty)}">${icon(s.reviewed ? 'check' : 'info')}${s.reviewed ? '已核实' : '待核实'}</span>` : ''}</td>
      <td><textarea class="cell-editor screen-editor" rows="3" data-field="screen" data-id="${escapeHtml(s.id)}" aria-label="镜头 ${n} 屏幕文字" placeholder="无屏幕文字">${escapeHtml(s.screen)}</textarea></td>
      <td><button class="review-button" data-review="${escapeHtml(s.id)}" aria-label="${s.reviewed ? '取消镜头' : '标记镜头'} ${n} 已校对" aria-pressed="${!!s.reviewed}" title="${s.reviewed ? '已校对，点击取消' : '标记已校对'}">${icon('check')}</button><button class="edit-button" data-edit="${escapeHtml(s.id)}" aria-label="编辑镜头 ${n} 详情" title="编辑时间、拍摄信息与待核实项">${icon('edit')}</button></td>
    </tr>`;
  }).join('');
  $('emptyShots').hidden = rows.length > 0;
  if (!rows.length) $('emptyShots').innerHTML = pendingOnly
    ? `<h3>没有待核实的分镜</h3><p>可以返回全部分镜，继续校对画面和文案。</p><button class="button secondary" data-action="show-all">查看全部分镜</button>`
    : `<h3>从第一个镜头开始</h3><p>${videoReady ? '视频已就绪。当前原型支持手动建表；' : '可以先整理分镜，原片需重新选择。'}<br>AI 自动拆解将在接入分析服务后开放。</p><button class="button primary" data-action="add-shot">${icon('plus')}创建第一个分镜</button>`;
  counts(); requestAnimationFrame(resizeEditors);
}
function renderTranscript() {
  $('transcriptBlocks').innerHTML = project.shots.length ? project.shots.map((s, i) => `<div class="transcript-block"><button class="time-link" data-seek="${escapeHtml(s.id)}">${formatTime(s.start)}</button><div><textarea class="cell-editor" data-id="${escapeHtml(s.id)}" data-field="speech" aria-label="镜头 ${i + 1} 完整口播" placeholder="本镜头暂无口播">${escapeHtml(s.speech)}</textarea>${isPending(s) ? `<span class="uncertainty">${icon('info')}${escapeHtml(s.uncertainty)}</span>` : ''}</div></div>`).join('') : '<div class="empty-state"><h3>还没有口播文案</h3><p>添加分镜并记录原文后，会在这里自动汇总。</p></div>';
  requestAnimationFrame(resizeEditors);
}
function renderStructure() {
  $('structureBlocks').innerHTML = project.structures.length ? project.structures.map((s, i) => `<article class="structure-card"><span class="structure-number">${String(i + 1).padStart(2, '0')}</span><div><header><h3>${escapeHtml(s.title)}</h3><span class="pill soft">${escapeHtml(s.role)}</span></header><textarea class="cell-editor" data-structure="${escapeHtml(s.id)}" aria-label="内容结构 ${i + 1} 分析">${escapeHtml(s.analysis)}</textarea><button class="time-link" data-content-seek="${s.start}">${formatTime(s.start)}–${formatTime(s.end)}</button></div></article>`).join('') : '<div class="empty-state"><h3>内容结构等待分析</h3><p>当前本地草稿没有 AI 分析结果。<br>示例项目可体验与分镜独立的内容分段。</p></div>';
  $('panel-structure').querySelector('.structure-bottom').hidden = project.kind !== 'demo';
  requestAnimationFrame(resizeEditors);
}
function setTab(next) {
  tab = next;
  document.querySelectorAll('[data-tab]').forEach(el => { el.setAttribute('aria-selected', String(el.dataset.tab === next)); el.tabIndex = el.dataset.tab === next ? 0 : -1; });
  ['shots', 'transcript', 'structure'].forEach(t => { $('panel-' + t).hidden = t !== next; });
  if (next === 'shots') renderShots();
  if (next === 'transcript') renderTranscript();
  if (next === 'structure') renderStructure();
}
function renderProject() {
  document.querySelectorAll('[data-action="resume-draft"]').forEach(el => { el.hidden = project.kind === 'local' || !getSaved('local'); });
  $('projectTitle').textContent = project.title;
  $('projectNavName').textContent = project.title;
  $('projectType').textContent = project.kind === 'demo' ? '示例项目' : '本地视频';
  $('fileName').textContent = project.fileName;
  $('fileMeta').textContent = project.kind === 'demo' ? '00:36 · 原创插画演示片 · 无音频' : `${formatTime(project.duration)} · 本地读取 · ${videoReady ? '原片已载入' : '请重新选择原片'}`;
  $('videoCategory').textContent = project.kind === 'demo' ? '生活方式' : '本地视频';
  $('demoNotice').innerHTML = `<span class="notice-symbol">i</span><span>${project.kind === 'demo' ? '当前为演示数据，用于体验校对流程；不代表 AI 实际识别结果。' : '当前为手动拆解草稿。AI 自动分析尚未接入，视频仅在本地读取。'}</span>`;
  $('analysisStep').innerHTML = project.kind === 'demo' ? `<span class="step-number">${icon('check')}</span><span>生成拆解初稿</span>` : '<span class="step-number">2</span><span>手动整理初稿</span>';
  $('videoUnavailable').hidden = videoReady;
  $('pendingFilter').setAttribute('aria-pressed', String(pendingOnly));
  setTab(tab); counts();
}
function showSample() {
  save();
  if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
  project = getSaved('demo') || clone(demo);
  selectedId = project.shots[0]?.id;
  pendingOnly = false; videoReady = true;
  video.src = 'assets/demo.mp4'; video.poster = project.shots[0]?.image || 'assets/shot-1.jpg';
  video.load(); tab = 'shots'; renderProject(); save();
  $('uploadDialog').close(); toast('已打开示例项目，可体验分镜校对与导出');
}
function resumeDraft() {
  const draft = getSaved('local');
  if (!draft) { toast('此浏览器中还没有本地视频草稿'); return; }
  save(); project = draft; selectedId = project.shots[0]?.id; pendingOnly = false;
  videoReady = false; video.removeAttribute('src'); video.removeAttribute('poster'); video.load();
  tab = 'shots'; renderProject(); save(); $('uploadDialog').close(); toast('已恢复本地草稿，重新选择原片即可继续对照');
}
function seek(seconds, id) {
  if (id) { selectedId = id; document.querySelectorAll('[data-shot]').forEach(el => el.classList.toggle('selected', el.dataset.shot === id)); }
  if (!videoReady) { toast('请重新选择原视频后再定位播放'); return; }
  video.currentTime = Math.max(0, Math.min(seconds, project.duration - .01));
  video.play().catch(() => toast('请在播放器中点击播放'));
}
function showEdit(id = null) {
  editingId = id; splitSourceId = null;
  let s = project.shots.find(s => s.id === id);
  if (!s) {
    const current = videoReady ? video.currentTime : 0;
    const lastEnd = Math.max(0, ...project.shots.map(s => s.end));
    const containing = project.shots.find(s => current >= s.start && current < s.end) || project.shots.find(s => s.id === selectedId);
    if (project.kind === 'local' && lastEnd < project.duration - .1) {
      const start = Math.round(Math.max(lastEnd, current < project.duration - .1 ? current : lastEnd) * 10) / 10;
      s = { start, end: Math.min(start + 4, project.duration), visual: '', camera: '', speech: '', screen: '', uncertainty: '', reviewed: false, approximate: false };
    } else if (containing) {
      splitSourceId = containing.id;
      const middle = Math.round((containing.start + containing.end) * 5) / 10;
      const start = current > containing.start + .1 && current < containing.end - .1 ? Math.round(current * 10) / 10 : middle;
      s = { start, end: containing.end, visual: '', camera: '', speech: '', screen: '', uncertainty: '', reviewed: false, approximate: false };
    } else s = { start: 0, end: Math.min(4, project.duration), visual: '', camera: '', speech: '', screen: '', uncertainty: '', reviewed: false, approximate: false };
  }
  $('editTitle').textContent = id ? `镜头 ${project.shots.findIndex(s => s.id === id) + 1} · 详情与校对` : splitSourceId ? '拆出一个新分镜' : '添加分镜';
  const form = $('editForm');
  for (const k of ['start', 'end', 'visual', 'camera', 'speech', 'screen', 'analysis', 'uncertainty']) form.elements[k].value = s[k] ?? '';
  form.elements.reviewed.checked = !!s.reviewed; form.elements.approximate.checked = !!s.approximate;
  $('editError').hidden = true;
  $('editDialog').showModal();
}
function captureFrame(shot) {
  if (project.kind === 'demo' || !videoReady || video.readyState < 2) return;
  const projectAtCapture = project;
  const record = () => {
    if (project !== projectAtCapture) return;
    try {
      const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = Math.round(180 * video.videoHeight / video.videoWidth);
      const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      shot.image = canvas.toDataURL('image/jpeg', .65); save(); if (tab === 'shots') renderShots();
    } catch { /* A missing thumbnail does not prevent editing or export. */ }
  };
  if (Math.abs(video.currentTime - shot.start) < .05) record();
  else { video.addEventListener('seeked', record, { once: true }); video.currentTime = shot.start; }
}
$('editForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const start = Number(data.get('start')), end = Number(data.get('end'));
  const error = (message) => { $('editError').textContent = message; $('editError').hidden = false; };
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > project.duration + .05) { error(`时间应满足：0 ≤ 开始时间 < 结束时间 ≤ ${project.duration.toFixed(1)} 秒。`); return; }
  const source = project.shots.find(s => s.id === splitSourceId);
  if (source && (start <= source.start || end > source.end)) { error(`新镜头应位于原镜头 ${range(source)} 内，开始时间需晚于原镜头。保存后会缩短原镜头的结束时间。`); return; }
  if (project.shots.some(s => s.id !== editingId && s.id !== splitSourceId && start < s.end - .01 && end > s.start + .01)) { error('此时间段与其他分镜重叠，请调整起止时间。'); return; }
  const existing = project.shots.find(s => s.id === editingId);
  const s = { ...(existing || {}), id: editingId || uid(), start, end, reviewed: data.has('reviewed'), approximate: data.has('approximate') };
  for (const key of ['visual', 'camera', 'speech', 'screen', 'analysis', 'uncertainty']) s[key] = String(data.get(key) || '').trim();
  if (existing) project.shots[project.shots.indexOf(existing)] = s;
  else { if (source) { source.end = start; source.reviewed = false; } project.shots.push(s); }
  project.shots.sort((a, b) => a.start - b.start); selectedId = s.id;
  save(); renderProject(); $('editDialog').close(); captureFrame(s); toast('分镜已保存');
});

async function loadVideo(file) {
  if (!file || uploadBusy) return;
  const fail = (message) => { $('uploadError').textContent = message; $('uploadError').hidden = false; if (!$('uploadDialog').open) toast(message); };
  if (!/\.(mp4|mov|webm)$/i.test(file.name)) { fail('请选择 MP4、MOV 或 WebM 视频文件。'); return; }
  if (!file.size || file.size > 200 * 1024 * 1024) { fail('请选择非空且不超过 200 MB 的视频。'); return; }
  uploadBusy = true; $('chooseFile').disabled = true; $('chooseFile').textContent = '正在读取视频…'; $('uploadError').hidden = true;
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise((resolve, reject) => {
      const probe = document.createElement('video'); probe.preload = 'metadata';
      const timer = setTimeout(() => { cleanup(); reject(new Error('读取超时，请尝试 MP4（H.264）视频。')); }, 12000);
      function cleanup() { clearTimeout(timer); probe.onloadedmetadata = null; probe.onerror = null; probe.removeAttribute('src'); probe.load(); }
      probe.onloadedmetadata = () => { const d = probe.duration; const width = probe.videoWidth; cleanup(); if (!Number.isFinite(d) || d <= 0 || !width) reject(new Error('未能读取视频画面，请检查文件是否损坏。')); else resolve(d); };
      probe.onerror = () => { cleanup(); reject(new Error('浏览器无法播放此编码，请转为 MP4（H.264）后重试。')); };
      probe.src = url;
    });
    if (relinking && (file.name !== project.fileName || Math.abs(duration - project.duration) > .5)) throw new Error('请重新选择这个项目的原视频：' + project.fileName);
    save();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = url;
    if (!relinking) {
      const previous = getSaved('local');
      project = previous?.fileName === file.name && Math.abs(previous.duration - duration) < .5 ? previous : { kind: 'local', title: file.name.replace(/\.[^.]+$/, ''), fileName: file.name, duration, shots: [], structures: [] };
      selectedId = project.shots[0]?.id || null;
    }
    videoReady = true; video.src = url; video.removeAttribute('poster'); video.load();
    pendingOnly = false; tab = 'shots'; renderProject(); save(); $('uploadDialog').close();
    toast(relinking ? '原片已重新关联，分镜草稿保持完整' : '视频已在本地载入，可以开始手动整理分镜');
  } catch (err) { URL.revokeObjectURL(url); fail(err.message || '视频载入失败，请重试。'); }
  finally { uploadBusy = false; relinking = false; $('chooseFile').disabled = false; $('chooseFile').innerHTML = '选择本地视频' + icon('arrow'); $('videoInput').value = ''; }
}
$('videoInput').addEventListener('change', e => loadVideo(e.target.files[0]));
$('chooseFile').addEventListener('click', () => { relinking = false; $('videoInput').click(); });
const zone = $('uploadZone');
['dragenter', 'dragover'].forEach(event => zone.addEventListener(event, e => { e.preventDefault(); zone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(event => zone.addEventListener(event, e => { e.preventDefault(); zone.classList.remove('dragover'); }));
zone.addEventListener('drop', e => { relinking = false; if (e.dataTransfer.files.length !== 1) { $('uploadError').textContent = '一次请选择一条视频。'; $('uploadError').hidden = false; return; } loadVideo(e.dataTransfer.files[0]); });

function transcript() { return project.shots.map(s => s.speech).filter(Boolean).join('\n\n'); }
const exportHeaders = ['镜头编号', '开始时间', '结束时间', '时间为约值', '画面与动作', '拍摄信息', '口播原文', '屏幕文字', '内容作用（分析判断）', '待核实项', '校对状态', '数据来源'];
function exportRows() { return project.shots.map((s, i) => [i + 1, formatTime(s.start, true), formatTime(s.end, true), s.approximate ? '是' : '否', s.visual, s.camera, s.speech, s.screen, s.analysis || '', s.uncertainty, s.reviewed ? '已校对' : '未校对', project.kind === 'demo' ? '演示数据，非 AI 实测' : '用户手动整理']); }
function formulaSafe(value) { const text = String(value ?? ''); return /^[\s]*[=+@-]/.test(text) ? "'" + text : text; }
function toDelimited(delimiter, quoted) { return [exportHeaders, ...exportRows()].map(row => row.map(value => { const safe = formulaSafe(value); return quoted ? '"' + safe.replace(/"/g, '""') + '"' : safe.replace(/[\t\r\n]+/g, ' '); }).join(delimiter)).join('\r\n'); }
function markdown() {
  const md = v => String(v ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const label = project.kind === 'demo' ? '演示数据，用于体验校对流程；非 AI 实际识别结果。示例片为原创插画，无音频，文案为虚构。' : '用户手动整理的本地草稿，未使用 AI 分析服务。';
  return `# ${project.title}\n\n> ${label}\n\n## 分镜脚本\n\n| ${exportHeaders.join(' | ')} |\n| ${exportHeaders.map(() => '---').join(' | ')} |\n${exportRows().map(row => '| ' + row.map(md).join(' | ') + ' |').join('\n')}\n\n## 完整口播\n\n${transcript() || '暂无口播文案。'}\n\n## 内容结构（分析判断）\n\n${project.structures.map(s => `### ${s.title} · ${formatTime(s.start)}–${formatTime(s.end)}\n\n${s.analysis}`).join('\n\n') || '暂无分析。'}\n\n---\n导出自「拆一条」V0.1。镜头截图未嵌入本文件。\n`;
}
async function copyText(text, success) {
  try { await navigator.clipboard.writeText(text); toast(success); return true; }
  catch { toast('浏览器未允许复制，请使用文件导出'); return false; }
}
async function exportProject(format) {
  if (!project.shots.length) { toast('先添加一个分镜，再导出你的拆解'); return; }
  if (format === 'clipboard') { if (await copyText(toDelimited('\t', false), '已复制分镜表，可直接粘贴到表格')) $('exportDialog').close(); return; }
  const pending = project.shots.filter(isPending).length;
  let content, type;
  if (format === 'csv') { content = '\uFEFF' + toDelimited(',', true); type = 'text/csv;charset=utf-8'; }
  if (format === 'md') { content = markdown(); type = 'text/markdown;charset=utf-8'; }
  if (format === 'txt') {
    const labels = project.kind === 'demo' ? '【演示文案，非 AI 实测；示例片无音频】\n\n' : '【用户手动整理口播】\n\n';
    content = labels + project.shots.map(s => `${range(s)}${isPending(s) ? ' 【待核实：' + s.uncertainty + '】' : ''}\n${s.speech || '（无口播）'}`).join('\n\n'); type = 'text/plain;charset=utf-8';
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = `${project.title.replace(/[\\/:*?"<>|]/g, '_')}_${format === 'txt' ? '口播文案' : '分镜拆解'}.${format}`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  $('exportDialog').close(); toast(`已导出 ${format.toUpperCase()}${pending ? `，保留 ${pending} 处待核实标记` : ''}`);
}

document.addEventListener('click', e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.tab) { setTab(button.dataset.tab); return; }
  if (button.dataset.close) { $(button.dataset.close).close(); return; }
  if (button.dataset.export) { exportProject(button.dataset.export); return; }
  if (button.dataset.seek) { const shot = project.shots.find(s => s.id === button.dataset.seek); if (shot) seek(shot.start, shot.id); return; }
  if (button.dataset.contentSeek !== undefined) { seek(Number(button.dataset.contentSeek)); return; }
  if (button.dataset.edit) { showEdit(button.dataset.edit); return; }
  if (button.dataset.review) {
    const s = project.shots.find(s => s.id === button.dataset.review); if (!s) return;
    s.reviewed = !s.reviewed; save(); renderShots(); toast(s.reviewed ? '已标记为校对完成' : '已取消校对标记'); return;
  }
  switch (button.dataset.action) {
    case 'upload': relinking = false; $('uploadError').hidden = true; $('uploadDialog').showModal(); break;
    case 'relink': relinking = true; $('videoInput').click(); break;
    case 'sample': showSample(); break;
    case 'resume-draft': resumeDraft(); break;
    case 'workspace': setTab('shots'); window.scrollTo({ top: 0, behavior: 'smooth' }); break;
    case 'help': $('helpDialog').showModal(); break;
    case 'export': $('exportSummary').textContent = `${project.shots.length} 个分镜 · ${project.shots.filter(isPending).length} 处待核实 · 修改内容将随文件保留`; $('exportDialog').showModal(); break;
    case 'add-shot': showEdit(); break;
    case 'show-all': pendingOnly = false; $('pendingFilter').setAttribute('aria-pressed', 'false'); renderShots(); break;
    case 'copy-transcript': copyText((project.kind === 'demo' ? '【演示文案，非 AI 实测】\n\n' : '') + transcript(), '完整口播已复制'); break;
  }
});
$('pendingFilter').addEventListener('click', () => { pendingOnly = !pendingOnly; $('pendingFilter').setAttribute('aria-pressed', String(pendingOnly)); renderShots(); });
document.addEventListener('input', e => {
  const target = e.target;
  if (target.dataset.field) {
    const s = project.shots.find(s => s.id === target.dataset.id);
    if (!s || !['visual', 'speech', 'screen'].includes(target.dataset.field)) return;
    s[target.dataset.field] = target.value; s.reviewed = false;
    const reviewButton = target.closest('tr')?.querySelector('.review-button'); if (reviewButton) { reviewButton.setAttribute('aria-pressed', 'false'); reviewButton.title = '标记已校对'; }
    counts(); scheduleSave(); resizeEditors();
  }
  if (target.dataset.structure) { const s = project.structures.find(s => s.id === target.dataset.structure); if (s) { s.analysis = target.value; scheduleSave(); resizeEditors(); } }
});
document.querySelector('.tablist').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); const tabs = ['shots', 'transcript', 'structure']; let next = tabs.indexOf(tab);
  if (e.key === 'ArrowLeft') next = (next + 2) % 3;
  if (e.key === 'ArrowRight') next = (next + 1) % 3;
  if (e.key === 'Home') next = 0;
  if (e.key === 'End') next = 2;
  setTab(tabs[next]); $('tab-' + tabs[next]).focus();
});
video.addEventListener('timeupdate', () => {
  const shot = project.shots.find(s => video.currentTime >= s.start && video.currentTime < s.end);
  if (shot && selectedId !== shot.id) { selectedId = shot.id; document.querySelectorAll('[data-shot]').forEach(el => el.classList.toggle('selected', el.dataset.shot === selectedId)); }
});
video.addEventListener('error', () => { if (videoReady && video.getAttribute('src')) toast('视频暂时无法播放，请重新选择文件或刷新示例'); });
window.addEventListener('resize', resizeEditors);
window.addEventListener('pagehide', save);
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); save(); });
try {
  const kind = localStorage.getItem(`${STORAGE}.current`) || 'demo';
  project = getSaved(kind) || clone(demo);
  selectedId = project.shots[0]?.id;
  if (project.kind === 'local') { videoReady = false; video.removeAttribute('src'); video.removeAttribute('poster'); video.load(); }
} catch { storageOk = false; }
renderProject();
if (!storageOk) $('saveStatus').textContent = '草稿未保存，请及时导出';
