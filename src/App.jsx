import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
Settings,
ChevronLeft,
ChevronRight,
Upload,
Link as LinkIcon,
Trash2,
BookOpen,
Zap,
RotateCcw,
AlertCircle,
Menu,
X,
CheckCircle2,
Download,
Moon,
Sun,
Monitor,
Type,
Eraser,
Copy,
Check,
Send,
ThumbsUp,
ThumbsDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- 常量与默认设置 ---
const APP_ID = 'smart-quiz-pwa-v5';
const DEFAULT_SETTINGS = {
theme: 'auto',
autoNext: true,
unvisitedFirst: false,
mistakeFirst: false,
fontSize: 18,
};

const shuffleArray = (array) => {
const newArr = [...array];
for (let i = newArr.length - 1; i > 0; i--) {
const j = Math.floor(Math.random() * (i + 1));
[newArr[i], newArr[j]] = [newArr[j], newArr[i]];
}
return newArr;
};

/**
* 核心逻辑：自动识别题型
* 优化优先级：判断 > 简答 > 多选 > 单选
*/
const getQuestionType = (q) => {
const ans = String(q.answer || '').trim();
const options = q.option || [];

// 1. 判断是否为判断题 (答案内容为对错，或者选项明确为对错)
const isJudgeAns = ['正确', '错误', '对', '错'].includes(ans);
const isJudgeOpts = options.length === 2 && options.every(o => ['正确', '错误', '对', '错'].includes(o));
if (isJudgeAns || isJudgeOpts) return 'judge';

// 2. 如果没有选项，判定为简答
if (options.length === 0) return 'short';

// 3. 答案包含多个字母，判定为多选
if (ans.length > 1 && /^[A-Z]+$/.test(ans)) return 'multiple';

// 4. 默认单选
return 'single';
};

export default function App() {
const [view, setView] = useState('home');
const [banks, setBanks] = useState([]);
const [currentBank, setCurrentBank] = useState(null);
const [questions, setQuestions] = useState([]);
const [currentIndex, setCurrentIndex] = useState(0);
const [mode, setMode] = useState('sequence');
const [history, setHistory] = useState({});
const [settings, setSettings] = useState(DEFAULT_SETTINGS);
const [isDrawerOpen, setIsDrawerOpen] = useState(false);
const [isSheetOpen, setIsSheetOpen] = useState(false);
const [direction, setDirection] = useState(0);
const [confirmClearHistory, setConfirmClearHistory] = useState(false);
const [toast, setToast] = useState(null);

const [multiSelect, setMultiSelect] = useState([]);
const [shortAnswerText, setShortAnswerText] = useState("");
const [showShortResult, setShowShortResult] = useState(false);

// 初始化与持久化
useEffect(() => {
const savedBanks = localStorage.getItem(`${APP_ID}-banks`);
const savedSettings = localStorage.getItem(`${APP_ID}-settings`);
const savedHistory = localStorage.getItem(`${APP_ID}-history`);
if (savedBanks) setBanks(JSON.parse(savedBanks));
if (savedSettings) setSettings(JSON.parse(savedSettings));
if (savedHistory) setHistory(JSON.parse(savedHistory));
}, []);

useEffect(() => {
const root = window.document.documentElement;
const isDark = settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
root.classList.toggle('dark', isDark);
}, [settings.theme]);

useEffect(() => {
localStorage.setItem(`${APP_ID}-banks`, JSON.stringify(banks));
localStorage.setItem(`${APP_ID}-settings`, JSON.stringify(settings));
localStorage.setItem(`${APP_ID}-history`, JSON.stringify(history));
}, [banks, settings, history]);

const showToast = (message) => {
setToast(message);
setTimeout(() => setToast(null), 2000);
};

const copyQuestion = (q) => {
const type = getQuestionType(q);
const label = { single: '单选', multiple: '多选', judge: '判断', short: '简答' }[type];
let textToCopy = `[${label}] ${q.title}\n`;
if (q.option && q.option.length > 0) {
textToCopy += q.option.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
}

const textArea = document.createElement("textarea");
textArea.value = textToCopy;
textArea.style.position = "fixed";
textArea.style.left = "-9999px";
document.body.appendChild(textArea);
textArea.focus();
textArea.select();
try {
document.execCommand('copy');
showToast("题目已复制");
} catch (err) {
showToast("复制失败");
}
document.body.removeChild(textArea);
};

const addBank = (name, data) => {
const newBank = { id: Date.now().toString(), name, data, count: data.length };
setBanks(prev => [newBank, ...prev]);
};

const startQuiz = (bank, startMode) => {
setCurrentBank(bank);
setMode(startMode);
let base = [...bank.data];
if (settings.unvisitedFirst) base.sort((a, b) => (history[a.id]?.answered ? 1 : -1));
if (settings.mistakeFirst) base.sort((a, b) => (history[a.id]?.correct === false ? -1 : 1));

if (startMode === 'random') base = shuffleArray(base);
else if (startMode === 'mistake') {
base = base.filter(q => history[q.id]?.correct === false);
if (base.length === 0) return alert("暂无错题记录！");
}
setQuestions(base);
setCurrentIndex(0);
resetTempStates();
setView('quiz');
};

const resetTempStates = () => {
setMultiSelect([]);
setShortAnswerText("");
setShowShortResult(false);
};

const navigate = (step) => {
const nextIdx = currentIndex + step;
if (nextIdx >= 0 && nextIdx < questions.length) {
setDirection(step);
setCurrentIndex(nextIdx);
resetTempStates();
}
};

const handleAnswer = (choice, isManualCorrect = null) => {
const q = questions[currentIndex];
const type = getQuestionType(q);

let isCorrect = false;
let finalChoice = choice;

if (type === 'short') {
isCorrect = isManualCorrect;
finalChoice = shortAnswerText;
} else if (type === 'multiple') {
const sortedChoice = choice.split('').sort().join('');
const sortedAnswer = q.answer.split('').sort().join('');
isCorrect = sortedChoice === sortedAnswer;
} else {
isCorrect = choice === q.answer;
}

setHistory(prev => ({ ...prev, [q.id]: { answered: true, correct: isCorrect, choice: finalChoice } }));

if (settings.autoNext && isCorrect && currentIndex < questions.length - 1 && mode !== 'study') {
setTimeout(() => navigate(1), 500);
}
};

// --- UI 组件 ---

const Sidebar = () => (
<div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-gray-900 shadow-2xl z-[150] transform transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
<div className="p-6 h-full flex flex-col">
<div className="flex justify-between items-center mb-8">
<h2 className="text-xl font-bold dark:text-white flex items-center gap-2"><Settings className="w-5 h-5"/> 设置</h2>
<button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><X className="dark:text-white"/></button>
</div>
<div className="flex-1 space-y-8 overflow-y-auto pr-1">
<section>
<label className="text-xs font-bold text-gray-400 uppercase mb-3 block tracking-widest">主题模式</label>
<div className="grid grid-cols-3 gap-2">
{['light', 'dark', 'auto'].map(t => (
<button key={t} onClick={() => setSettings(s => ({...s, theme: t}))} className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${settings.theme === t ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-gray-100 dark:border-gray-800 text-gray-400'}`}>
{t === 'light' ? <Sun className="w-4 h-4"/> : t === 'dark' ? <Moon className="w-4 h-4"/> : <Monitor className="w-4 h-4"/>}
<span className="text-[10px]">{t === 'light' ? '白天' : t === 'dark' ? '黑夜' : '自动'}</span>
</button>
))}
</div>
</section>
<section className="space-y-4">
<label className="text-xs font-bold text-gray-400 uppercase block tracking-widest">答题偏好</label>
{[
{ label: '答对自动下一题', key: 'autoNext' },
{ label: '未做题目优先', key: 'unvisitedFirst' },
{ label: '错题优先', key: 'mistakeFirst' }
].map(item => (
<div key={item.key} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
<span className="text-sm dark:text-gray-200">{item.label}</span>
<button onClick={() => setSettings(s => ({...s, [item.key]: !s[item.key]}))} className={`w-10 h-5 rounded-full transition-colors relative ${settings[item.key] ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
<div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings[item.key] ? 'left-6' : 'left-1'}`} />
</button>
</div>
))}
</section>
<section>
<label className="text-xs font-bold text-gray-400 uppercase mb-3 block flex justify-between tracking-widest">
字体大小 <span>{settings.fontSize}px</span>
</label>
<input type="range" min="14" max="28" value={settings.fontSize} onChange={e => setSettings(s => ({...s, fontSize: parseInt(e.target.value)}))} className="w-full accent-blue-500" />
</section>
<section className="space-y-3 pt-4 border-t dark:border-gray-800">
<button onClick={() => { if(!confirmClearHistory){ setConfirmClearHistory(true); setTimeout(()=>setConfirmClearHistory(false),3000); } else { setHistory({}); setConfirmClearHistory(false); showToast("记录已清空"); } }} className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${confirmClearHistory ? 'bg-red-500 text-white animate-pulse' : 'bg-red-50 dark:bg-red-900/10 text-red-600 border border-red-100 dark:border-red-900/30'}`}>
<Eraser className="w-4 h-4"/> {confirmClearHistory ? '确认清除？' : '清除做题记录'}
</button>
<button onClick={() => { const d = { banks, history, settings }; const b = new Blob([JSON.stringify(d)], {type:'application/json'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download='quiz_backup.json'; a.click(); }} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"><Download className="w-4 h-4"/> 导出做题记录</button>
</section>
</div>
</div>
</div>
);

const HomeView = () => (
<div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 flex flex-col items-center">
<div className="w-full max-w-2xl">
<header className="flex justify-between items-center py-8">
<h1 className="text-2xl font-black text-gray-900 dark:text-white italic tracking-tighter uppercase">Quiz Master</h1>
<button onClick={() => setIsDrawerOpen(true)} className="p-2 bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-800 transition-transform active:scale-90"><Settings className="dark:text-gray-400"/></button>
</header>
<div className="grid grid-cols-1 gap-6">
<div className="bg-white dark:bg-gray-900 p-8 rounded-[2rem] shadow-sm border dark:border-gray-800">
<h2 className="font-bold text-gray-400 text-xs uppercase tracking-widest mb-4">导入中心</h2>
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
<label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-all group">
<Upload className="w-6 h-6 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
<span className="text-xs font-bold text-gray-500">上传 JSON 题库</span>
<input type="file" className="hidden" accept=".json" onChange={e => {
const f = e.target.files[0]; if(!f) return;
const r = new FileReader(); r.onload = ev => addBank(f.name.replace('.json',''), JSON.parse(ev.target.result)); r.readAsText(f);
}} />
</label>
<div className="flex flex-col justify-center gap-2">
<div className="relative">
<LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
<input type="text" placeholder="输入 URL 加载..." className="w-full pl-8 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-xs dark:text-white focus:ring-1 ring-blue-500 outline-none" onKeyDown={e => {
if(e.key === 'Enter') { fetch(e.target.value).then(res => res.json()).then(data => addBank('远程题库', data)).catch(()=>alert('加载失败')); }
}} />
</div>
<p className="text-[10px] text-gray-400 px-1">支持外部链接</p>
</div>
</div>
</div>
<div className="space-y-4">
<h2 className="font-bold text-gray-400 text-xs uppercase tracking-widest px-2">本地题库 ({banks.length})</h2>
{banks.map(bank => (
<div key={bank.id} className="bg-white dark:bg-gray-900 p-5 rounded-2xl border dark:border-gray-800 group hover:shadow-lg transition-all">
<div className="flex justify-between items-start mb-4">
<div>
<h3 className="font-bold dark:text-white group-hover:text-blue-600 transition-colors">{bank.name}</h3>
<p className="text-xs text-gray-400">{bank.count} 题目</p>
</div>
<button onClick={() => setBanks(prev => prev.filter(b => b.id !== bank.id))} className="text-gray-300 hover:text-red-500 p-1 transition-colors"><Trash2 className="w-4 h-4"/></button>
</div>
<div className="grid grid-cols-4 gap-2">
{[
{ m: 'sequence', l: '顺序', c: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
{ m: 'random', l: '乱序', c: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20' },
{ m: 'study', l: '背题', c: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
{ m: 'mistake', l: '错题', c: 'text-red-500 bg-red-50 dark:bg-red-900/20' }
].map(btn => (
<button key={btn.m} onClick={() => startQuiz(bank, btn.m)} className={`py-2 text-[11px] font-black rounded-lg transition-all active:scale-95 ${btn.c}`}>{btn.l}</button>
))}
</div>
</div>
))}
</div>
</div>
</div>
</div>
);

const QuizView = () => {
const q = questions[currentIndex];
const h = history[q?.id];
const type = getQuestionType(q);
const showAnswer = h?.answered || mode === 'study';

// 处理判断题选项：如果判断题缺失选项数组，自动创建选项
const displayOptions = useMemo(() => {
if (type === 'judge' && (!q.option || q.option.length === 0)) {
// 尝试从答案格式中推测选项类型 (对/错 or 正确/错误)
if (q.answer === '对' || q.answer === '错') return ['对', '错'];
return ['正确', '错误'];
}
return q.option || [];
}, [q, type]);

const onDragEnd = (event, info) => {
if (info.offset.x > 50) navigate(-1);
else if (info.offset.x < -50) navigate(1);
};

if (!q) return null;

return (
<div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col fixed inset-0 z-10 overflow-hidden">
<header className="p-4 flex items-center justify-between border-b dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-50">
<div className="flex items-center gap-3">
<button onClick={() => setView('home')} className="p-2 dark:text-white active:scale-90 transition-transform"><ChevronLeft/></button>
<div className="text-sm font-bold dark:text-white line-clamp-1 max-w-[120px]">{currentBank.name}</div>
</div>
<div className="flex items-center gap-2">
<span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">{currentIndex + 1} / {questions.length}</span>
<button onClick={() => setIsSheetOpen(true)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg active:scale-90"><Menu className="w-5 h-5 dark:text-white"/></button>
<button onClick={() => setIsDrawerOpen(true)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg active:scale-90"><Settings className="w-5 h-5 dark:text-white"/></button>
</div>
</header>

<div className="flex-1 relative overflow-hidden flex flex-col">
<AnimatePresence mode="wait" initial={false} custom={direction}>
<motion.div
key={currentIndex} custom={direction}
variants={{
enter: (d) => ({ x: d > 0 ? '100%' : d < 0 ? '-100%' : 0, opacity: 0 }),
center: { x: 0, opacity: 1 },
exit: (d) => ({ x: d > 0 ? '-100%' : d < 0 ? '100%' : 0, opacity: 0 })
}}
initial="enter" animate="center" exit="exit" transition={{ type: "spring", damping: 25, stiffness: 200 }}
drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2} onDragEnd={onDragEnd}
className="absolute inset-0 p-6 flex flex-col h-full overflow-y-auto pb-32 touch-pan-y"
>
<div className="max-w-2xl mx-auto w-full">
{/* 题干区域 */}
<motion.div
whileTap={{ scale: 0.98 }} onClick={() => copyQuestion(q)}
className="font-bold text-gray-800 dark:text-gray-100 leading-relaxed mb-8 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-800/50 p-4 -m-4 rounded-2xl transition-all relative group"
style={{ fontSize: `${settings.fontSize}px` }}
>
<span className={`inline-block text-white text-[10px] px-2 py-0.5 rounded mr-2 align-middle font-bold ${
type === 'single' ? 'bg-blue-600' : type === 'multiple' ? 'bg-indigo-600' : type === 'judge' ? 'bg-purple-600' : 'bg-gray-600'
}`}>
{type === 'single' ? '单选' : type === 'multiple' ? '多选' : type === 'judge' ? '判断' : '简答'}
</span>
{q.title}
<div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"><Copy className="w-4 h-4 text-gray-400" /></div>
</motion.div>

{/* 内容交互区 */}
<div className="space-y-3">
{type === 'short' ? (
<div className="space-y-4">
<textarea
value={shortAnswerText}
onChange={(e) => setShortAnswerText(e.target.value)}
disabled={showAnswer}
placeholder="在此输入您的简答内容..."
className="w-full h-44 p-5 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-2xl text-sm focus:ring-2 ring-blue-500 outline-none transition-all dark:text-white resize-none shadow-inner"
/>
{!showAnswer && !showShortResult && (
<button
onClick={() => setShowShortResult(true)}
className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
>
回答完毕，查看参考答案 <Send className="w-4 h-4" />
</button>
)}
</div>
) : (
displayOptions.map((opt, idx) => {
const char = String.fromCharCode(65 + idx);
// 如果是判断题且是从答案补全的，比较内容；否则单选多选比较字母
const isOptionMatchValue = type === 'judge' ? opt : char;

const isSelected = type === 'multiple' ? multiSelect.includes(char) : h?.choice === isOptionMatchValue;

// 判定逻辑：如果是多选看答案是否包含字母，如果是判断看内容是否相等，如果是单选看字母
let isCorrect = false;
if (type === 'multiple') isCorrect = q.answer.includes(char);
else if (type === 'judge') isCorrect = opt === q.answer;
else isCorrect = char === q.answer;

let cls = "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400";
if (showAnswer) {
if (isCorrect) cls = "bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-400";
else if (isSelected) cls = "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400";
} else if (isSelected) {
cls = "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600";
}

return (
<button
key={idx}
disabled={showAnswer}
onClick={() => {
if (type === 'multiple') {
setMultiSelect(prev => prev.includes(char) ? prev.filter(c => c !== char) : [...prev, char]);
} else {
handleAnswer(isOptionMatchValue);
}
}}
className={`w-full text-left p-5 rounded-2xl border-2 transition-all flex items-start gap-4 active:scale-[0.99] ${cls}`}
>
<span className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
isSelected || (showAnswer && isCorrect) ? 'bg-current border-transparent text-white' : 'border-gray-200 dark:border-gray-700'
}`}>
{type === 'judge' ? (opt.includes('对') || opt.includes('正确') ? '√' : '×') : char}
</span>
<span style={{ fontSize: `${settings.fontSize}px` }}>{opt}</span>
</button>
);
})
)}

{/* 多选确认提交 */}
{type === 'multiple' && !showAnswer && (
<button
onClick={() => handleAnswer(multiSelect.sort().join(''))}
disabled={multiSelect.length === 0}
className="w-full py-4 mt-4 bg-indigo-600 text-white rounded-2xl font-bold disabled:opacity-30 shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
>
确认所选方案 ({multiSelect.length}) <Check className="w-4 h-4"/>
</button>
)}
</div>

{/* 结果呈现区域 */}
{(showAnswer || showShortResult) && (
<motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/10 rounded-3xl border border-blue-100 dark:border-blue-900/30">
<div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-black mb-3 tracking-widest uppercase text-xs">
<CheckCircle2 className="w-4 h-4" /> 详情解析
</div>
<div className="text-gray-800 dark:text-gray-200 mb-4 font-bold" style={{ fontSize: `${settings.fontSize}px` }}>
标准答案：<span className="text-green-600 dark:text-green-400">{q.answer}</span>
</div>
{q.analysis && <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed border-t dark:border-gray-800 pt-3 italic">{q.analysis}</p>}

{/* 简答题人工评定 */}
{type === 'short' && !showAnswer && (
<div className="mt-6 flex gap-3">
<button onClick={() => handleAnswer(null, true)} className="flex-1 py-4 bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-green-500/10"><ThumbsUp className="w-4 h-4"/> 我答对了</button>
<button onClick={() => handleAnswer(null, false)} className="flex-1 py-4 bg-red-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-red-500/10"><ThumbsDown className="w-4 h-4"/> 我答错了</button>
</div>
)}
</motion.div>
)}
</div>
</motion.div>
</AnimatePresence>
</div>

{/* 固定底部控制栏 */}
<div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-white dark:from-gray-950 via-white/80 pointer-events-none">
<div className="max-w-md mx-auto flex gap-4 pointer-events-auto">
<button onClick={() => navigate(-1)} disabled={currentIndex === 0} className="flex-1 py-4 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl shadow-xl shadow-black/5 dark:text-white flex items-center justify-center gap-2 active:scale-95 disabled:opacity-20 transition-all font-bold text-sm"><ChevronLeft className="w-4 h-4"/> 上一题</button>
<button onClick={() => navigate(1)} disabled={currentIndex === questions.length - 1} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/20 font-bold flex items-center justify-center gap-2 active:scale-95 disabled:opacity-20 transition-all text-sm">下一题 <ChevronRight className="w-4 h-4"/></button>
</div>
</div>
</div>
);
};

const AnswerSheet = () => (
<div className={`fixed inset-0 z-[120] transition-all duration-300 ${isSheetOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSheetOpen(false)} />
<motion.div initial={{ y: '100%' }} animate={{ y: isSheetOpen ? 0 : '100%' }} transition={{ type: 'spring', damping: 25 }} className="absolute bottom-0 inset-x-0 bg-white dark:bg-gray-900 rounded-t-[2.5rem] p-8 max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
<div className="flex justify-between items-center mb-6 px-2">
<h3 className="text-xl font-black dark:text-white tracking-tighter uppercase">答题进度预览</h3>
<button onClick={() => setIsSheetOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full dark:text-white active:scale-90"><X/></button>
</div>
<div className="flex-1 overflow-y-auto grid grid-cols-5 sm:grid-cols-8 gap-3 pb-6 pr-2">
{questions.map((q, i) => {
const res = history[q.id];
let dot = "bg-gray-50 dark:bg-gray-800 text-gray-400";
if(res?.answered) dot = res.correct ? "bg-green-500 text-white" : "bg-red-500 text-white";
return (
<button key={i} onClick={() => { setCurrentIndex(i); setIsSheetOpen(false); resetTempStates(); }} className={`h-12 rounded-xl text-xs font-black transition-all active:scale-90 ${dot} ${i === currentIndex ? 'ring-4 ring-blue-500/30 ring-offset-2 dark:ring-offset-gray-900' : ''}`}>{i + 1}</button>
);
})}
</div>
</motion.div>
</div>
);

return (
<div className="font-sans selection:bg-blue-100 dark:selection:bg-blue-900 overflow-hidden relative">
{view === 'home' ? <HomeView /> : <QuizView />}

<Sidebar />
<AnswerSheet />

<AnimatePresence>
{toast && (
<motion.div initial={{ y: -50, opacity: 0, x: '-50%' }} animate={{ y: 20, opacity: 1, x: '-50%' }} exit={{ y: -50, opacity: 0, x: '-50%' }} className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 bg-gray-900/90 dark:bg-blue-600/90 backdrop-blur-md text-white rounded-full shadow-2xl flex items-center gap-2 text-sm font-bold whitespace-nowrap">
<Check className="w-4 h-4 text-green-400" /> {toast}
</motion.div>
)}
</AnimatePresence>

{isDrawerOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] transition-opacity" onClick={() => setIsDrawerOpen(false)} />}
</div>
);
}

// PWA 基础支持
if ('serviceWorker' in navigator) {
window.addEventListener('load', () => {
const swCode = `self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));`;
const blob = new Blob([swCode], { type: 'text/javascript' });
navigator.serviceWorker.register(URL.createObjectURL(blob));
});
}

