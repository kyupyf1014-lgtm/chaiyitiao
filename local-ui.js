/* Local API only. All scripts, fonts, models and media stay on this machine. */
let localHealth = null;
let selectedLocalFile = null;
let activeJob = null;
let diskQueue = Promise.resolve();
let pendingDiskWrites = 0;
const diskSnapshots = new Map();
const failedDiskWrites = new Set();

async function localApi(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'X-Local-Token': localHealth?.token || '', ...options.headers } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '本地服务暂时不可用');
  return data;
}

window.queueDiskSave = function (value) {
  try {
    localStorage.setItem(`${STORAGE}.diskCurrent`, value.id);
    localStorage.setItem(`${STORAGE}.current`, 'local');
  } catch { /* Disk persistence remains available without browser storage. */ }
  const body = JSON.stringify(value);
  if (diskSnapshots.get(value.id) === body) return;
  diskSnapshots.set(value.id, body);
  const id = value.id;
  pendingDiskWrites++;
  $('saveStatus').textContent = '正在保存到本机…';
  diskQueue = diskQueue.then(async () => {
    try {
      await localApi(`/api/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      failedDiskWrites.delete(id);
      if (project.id === id) $('saveStatus').innerHTML = icon('check') + '已保存到本机';
    } catch (error) {
      diskSnapshots.delete(id);
      failedDiskWrites.add(id);
      if (project.id === id) $('saveStatus').textContent = '保存失败，请导出备份';
      toast(error.message);
    } finally { pendingDiskWrites--; }
  });
};

window.openDiskProject = async function (id) {
  try {
    clearTimeout(saveTimer);
    save();
    await diskQueue;
    if (failedDiskWrites.has(project.id)) throw new Error('当前编辑尚未保存，请先导出备份，再切换项目。');
    const loaded = await localApi(`/api/projects/${id}`);
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    project = loaded;
    diskSnapshots.set(id, JSON.stringify(loaded));
    selectedId = project.shots[0]?.id;
    pendingOnly = false;
    videoReady = true;
    video.src = `/api/projects/${id}/video`;
    video.poster = project.shots[0]?.image || '';
    video.load();
    tab = 'shots';
    renderProject();
    save();
    $('saveStatus').innerHTML = icon('check') + '已保存到本机';
    $('libraryDialog').close();
    $('uploadDialog').close();
  } catch (error) { toast(error.message); }
};

window.stageLocalVideo = function (file) {
  if (activeJob) return;
  const fail = message => { $('uploadError').textContent = message; $('uploadError').hidden = false; };
  if (!/\.(mp4|mov|webm)$/i.test(file.name) || !file.size || file.size > 200 * 1024 * 1024) {
    fail('请选择非空且不超过 200 MB 的 MP4、MOV 或 WebM 视频。'); return;
  }
  selectedLocalFile = file;
  $('uploadError').hidden = true;
  $('selectedFile').hidden = false;
  $('selectedFile').textContent = `已选择：${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
  $('startAnalysis').disabled = !localHealth?.ready;
  $('videoInput').value = '';
  if (!localHealth?.ready) fail('请先双击「安装本地环境.command」，完成后重新打开工具。');
};

async function watchJob(id) {
  activeJob = id;
  $('cancelAnalysis').disabled = false;
  $('cancelAnalysis').textContent = '取消处理';
  if (!$('analysisDialog').open) $('analysisDialog').showModal();
  try {
    while (activeJob === id) {
      const job = await localApi(`/api/jobs/${id}`);
      $('analysisPhase').textContent = job.phase;
      $('analysisProgress').value = job.progress;
      if (job.status !== 'processing') {
        if (job.status === 'completed') {
          await window.openDiskProject(id);
          toast(`拆解完成：${project.shots.length} 个分镜，${project.shots.filter(s => s.speech).length} 个含口播`);
        } else toast(job.phase);
        activeJob = null;
        try { localStorage.removeItem(`${STORAGE}.job`); } catch { /* Optional cache. */ }
        $('analysisDialog').close();
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } catch (error) {
    activeJob = null;
    $('analysisDialog').close();
    toast('处理状态读取中断，请确认本地服务正在运行，再刷新页面恢复。');
  }
}

$('startAnalysis').addEventListener('click', async () => {
  if (!selectedLocalFile || activeJob) return;
  $('startAnalysis').disabled = true;
  $('startAnalysis').textContent = '正在读入本地文件…';
  try {
    const file = selectedLocalFile;
    const query = new URLSearchParams({ name: file.name, language: $('speechLanguage').value, sensitivity: $('sceneSensitivity').value });
    const { id } = await localApi(`/api/jobs?${query}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    try { localStorage.setItem(`${STORAGE}.job`, id); } catch { /* Project is still on disk. */ }
    $('analysisFile').textContent = file.name;
    $('analysisPhase').textContent = '准备本地处理';
    $('analysisProgress').value = 0;
    $('uploadDialog').close();
    watchJob(id);
  } catch (error) { $('uploadError').textContent = error.message; $('uploadError').hidden = false; }
  finally { $('startAnalysis').disabled = !localHealth?.ready; $('startAnalysis').innerHTML = '开始本地拆解 ' + icon('spark'); }
});
$('analysisDialog').addEventListener('cancel', e => e.preventDefault());
$('cancelAnalysis').addEventListener('click', async () => {
  if (!activeJob) return;
  try {
    await localApi(`/api/jobs/${activeJob}/cancel`, { method: 'POST' });
    $('cancelAnalysis').disabled = true;
    $('cancelAnalysis').textContent = '正在停止当前步骤…';
  } catch (error) { toast(error.message); }
});

async function showLibrary() {
  $('libraryList').textContent = '正在读取本地项目…';
  $('libraryDialog').showModal();
  try {
    await diskQueue;
    const projects = await localApi('/api/projects');
    $('libraryList').innerHTML = projects.length ? projects.map(p => `<button class="library-project" data-local-project="${escapeHtml(p.id)}"><span class="library-project-icon">${icon('film')}</span><span><b>${escapeHtml(p.title)}</b><small>${formatTime(p.duration)} · ${p.count} 个分镜 · ${new Date(p.updatedAt).toLocaleDateString('zh-CN')}</small></span>${icon('arrow')}</button>`).join('') : '<div class="empty-state"><h3>还没有本地拆解项目</h3><p>导入一条视频，完成后会自动保存在这里。</p></div>';
  } catch { $('libraryList').textContent = '请通过「启动拆一条.command」启动本地服务后重试。'; }
}
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b?.dataset.action === 'library') showLibrary();
  if (b?.dataset.localProject) window.openDiskProject(b.dataset.localProject);
});

function downloadLocal(content, extension, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title.replace(/[\\/:*?"<>|]/g, '_')}_拆解.${extension}`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $('exportDialog').close();
  toast(`已导出 ${extension.toUpperCase()}`);
}
function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
window.exportLocalFormat = function (format) {
  if (format === 'srt') {
    const cues = project.shots.filter(s => s.speech.trim());
    if (!cues.length) { toast('没有可导出的口播文案'); return true; }
    downloadLocal(cues.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.speech}`).join('\n\n') + '\n', 'srt', 'text/plain;charset=utf-8');
    return true;
  }
  if (format === 'html') {
    const label = project.source === 'offline' ? '本地模型转写与自动分镜 · 可人工校对' : project.kind === 'demo' ? '虚构演示文案 · 非真实识别结果' : '手动整理';
    const shots = clone(project.shots);
    // Demo pictures are local files; convert them to inline data for a portable report.
    Promise.all(shots.map(async s => {
      if (s.image && !s.image.startsWith('data:image/jpeg;base64,')) {
        if (!/^assets\/shot-[1-6]\.jpg$/.test(s.image)) { s.image = ''; return; }
        const blob = await (await fetch(s.image)).blob();
        s.image = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      }
    })).then(() => {
      const lines = v => escapeHtml(v).replace(/\n/g, '<br>');
      const content = `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(project.title)}</title><style>body{font-family:system-ui,sans-serif;background:#f5f6f3;color:#283329;max-width:1000px;margin:40px auto;padding:0 24px;line-height:1.8}h1{font-size:30px}header p,small{color:#68745f}article{background:#fff;border:1px solid #e0e5da;border-radius:12px;padding:24px;margin:20px 0;display:grid;grid-template-columns:180px 1fr;gap:24px}img{max-width:180px;max-height:260px;border-radius:6px}h2{margin:0;font-size:18px}dl{margin:8px 0}dt{font-size:12px;color:#68745f;margin-top:12px}dd{margin:0}footer{margin:40px 0}@media(max-width:600px){article{grid-template-columns:1fr}}@media print{article{break-inside:avoid}}</style><header><small>拆一条 / OFFLINE REPORT</small><h1>${escapeHtml(project.title)}</h1><p>${label} · ${shots.length} 个分镜 · ${formatTime(project.duration)}<br>画面描述和屏幕文字为手动记录。未校对的识别结果请对照原片核实。</p></header>${shots.map((s, i) => `<article><div>${s.image ? `<img src="${escapeHtml(s.image)}" alt="镜头 ${i + 1}">` : ''}</div><div><h2>${String(i + 1).padStart(2, '0')} · ${range(s)}</h2><small>${s.reviewed ? '已校对' : '未校对'}</small><dl><dt>口播原文</dt><dd>${lines(s.speech) || '（无口播）'}</dd>${[['画面与动作', s.visual], ['拍摄信息', s.camera], ['屏幕文字', s.screen], ['内容作用（手动分析）', s.analysis], ['核实记录', s.uncertainty]].filter(([,v]) => v).map(([k,v]) => `<dt>${k}</dt><dd>${lines(v)}</dd>`).join('')}</dl></div></article>`).join('')}<footer>拆一条 · 本地基础版。此文件包含截图和文本，不包含原视频。</footer></html>`;
      downloadLocal(content, 'html', 'text/html;charset=utf-8');
    }).catch(() => toast('截图读取失败，请重试导出'));
    return true;
  }
  return false;
};

window.addEventListener('beforeunload', e => {
  if (pendingDiskWrites || failedDiskWrites.size) { e.preventDefault(); e.returnValue = ''; }
});

(async () => {
  try {
    localHealth = await localApi('/api/health');
    $('engineStatus').innerHTML = '<span class="status-dot"></span>' + (localHealth.ready ? '本地引擎已就绪 · Whisper base' : '本地模型尚未安装');
    $('startAnalysis').disabled = !selectedLocalFile || !localHealth.ready;
    let current, job;
    try { current = localStorage.getItem(`${STORAGE}.diskCurrent`); job = localStorage.getItem(`${STORAGE}.job`); } catch { /* Optional cache. */ }
    if (current && /^[a-f0-9]{32}$/.test(current)) await window.openDiskProject(current);
    if (job && /^[a-f0-9]{32}$/.test(job)) { $('analysisFile').textContent = '恢复上次处理进度'; watchJob(job); }
  } catch {
    $('engineStatus').textContent = '本地引擎未启动 · 请双击「启动拆一条.command」';
  }
})();
