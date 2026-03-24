import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Settings, ChevronLeft, ChevronRight, Upload, Link as LinkIcon, 
  Trash2, BookOpen, Zap, RotateCcw, AlertCircle, Menu, X, 
  CheckCircle2, Download, Moon, Sun, Monitor, Type, Eraser, 
  Copy, Check, Send, ThumbsUp, ThumbsDown, History, FileUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- 常量与默认设置 ---
const APP_ID = 'smart-quiz-v8';
const DEFAULT_SETTINGS = {
  theme: 'auto', autoNext: true, unvisitedFirst: false, mistakeFirst: false, fontSize: 18,
};

const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const getQuestionType = (q) => {
  const ans = String(q.answer || '').trim();
  const options = q.option || [];
  const isJudgeAns = ['正确', '错误', '对', '错'].includes(ans);
  const isJudgeOpts = options.length === 2 && options.every(o => ['正确', '错误', '对', '错'].includes(o));
  if (isJudgeAns || isJudgeOpts) return 'judge';
  if (options.length === 0) return 'short';
  if (ans.length > 1 && /^[A-Z]+$/.test(ans)) return 'multiple';
  return 'single';
};

export default function App() {
  const [view, setView] = useState('home');
  const [banks, setBanks] = useState([]);
  const [currentBank, setCurrentBank] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState('sequence');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  
  const [stats, setStats] = useState({}); 
  const [progress, setProgress] = useState({}); 
  
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [direction, setDirection] = useState(0);
  const [toast, setToast] = useState(null);
  const [resumeModal, setResumeModal] = useState(null);

  const [multiSelect, setMultiSelect] = useState([]);
  const [shortAnswerText, setShortAnswerText] = useState("");
  const [showShortResult, setShowShortResult] = useState(false);

  // 滚动引用，用于控制翻页后的滚动位置
  const scrollRef = useRef(null);

  // 初始化
  useEffect(() => {
    const savedBanks = localStorage.getItem(`${APP_ID}-banks`);
    const savedSettings = localStorage.getItem(`${APP_ID}-settings`);
    const savedStats = localStorage.getItem(`${APP_ID}-stats`);
    const savedProgress = localStorage.getItem(`${APP_ID}-progress`);
    
    if (savedBanks) setBanks(JSON.parse(savedBanks));
    if (savedSettings) setSettings(JSON.parse(savedSettings));
    if (savedStats) setStats(JSON.parse(savedStats));
    if (savedProgress) setProgress(JSON.parse(savedProgress));
  }, []);

  // 持久化
  useEffect(() => {
    localStorage.setItem(`${APP_ID}-banks`, JSON.stringify(banks));
    localStorage.setItem(`${APP_ID}-settings`, JSON.stringify(settings));
    localStorage.setItem(`${APP_ID}-stats`, JSON.stringify(stats));
    localStorage.setItem(`${APP_ID}-progress`, JSON.stringify(progress));
  }, [banks, settings, stats, progress]);

  // 主题控制
  useEffect(() => {
    const isDark = settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [settings.theme]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const addBank = (filename, data) => {
    const bankId = filename.replace('.json', '');
    const newBank = { id: bankId, name: bankId, data, count: data.length };
    setBanks(prev => {
      const filtered = prev.filter(b => b.id !== bankId);
      return [newBank, ...filtered];
    });
    showToast(`题库 ${bankId} 已导入`);
  };

  // 导入备份逻辑
  const importBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        if (backup.banks) setBanks(backup.banks);
        if (backup.stats) setStats(backup.stats);
        if (backup.settings) setSettings(backup.settings);
        if (backup.progress) setProgress(backup.progress);
        showToast("备份数据已成功导入");
      } catch (err) {
        showToast("导入失败：文件格式不正确");
      }
    };
    reader.readAsText(file);
  };

  const startQuiz = (bank, startMode, forcedIndex = null) => {
    if (forcedIndex === null && progress[bank.id] > 0 && startMode === 'sequence') {
      setResumeModal({ bank, mode: startMode, index: progress[bank.id] });
      return;
    }

    setCurrentBank(bank);
    setMode(startMode);
    let base = [...bank.data];
    const bankStats = stats[bank.id] || {};

    if (settings.unvisitedFirst) base.sort((a, b) => (bankStats[a.id]?.total > 0 ? 1 : -1));
    if (settings.mistakeFirst) base.sort((a, b) => {
      const sA = bankStats[a.id] || { correct: 0, total: 0 };
      const sB = bankStats[b.id] || { correct: 0, total: 0 };
      const rateA = sA.total > 0 ? sA.correct / sA.total : 1;
      const rateB = sB.total > 0 ? sB.correct / sB.total : 1;
      return rateA - rateB;
    });

    if (startMode === 'random') base = shuffleArray(base);
    else if (startMode === 'mistake') {
      base = base.filter(q => {
        const s = bankStats[q.id];
        return s && s.correct < s.total;
      });
      if (base.length === 0) return showToast("暂无错题记录！");
    }

    setQuestions(base);
    setCurrentIndex(forcedIndex !== null ? forcedIndex : 0);
    resetTempStates();
    setView('quiz');
    setResumeModal(null);
  };

  const resetTempStates = () => {
    setMultiSelect([]);
    setShortAnswerText("");
    setShowShortResult(false);
    if (scrollRef.current) scrollRef.current.scrollTo(0, 0);
  };

  const navigate = (step) => {
    const nextIdx = currentIndex + step;
    if (nextIdx >= 0 && nextIdx < questions.length) {
      setDirection(step);
      setCurrentIndex(nextIdx);
      resetTempStates();
      if (mode === 'sequence') {
        setProgress(prev => ({ ...prev, [currentBank.id]: nextIdx }));
      }
    }
  };

  const handleAnswer = (choice, isManualCorrect = null) => {
    const q = questions[currentIndex];
    const type = getQuestionType(q);
    let isCorrect = false;

    if (type === 'short') isCorrect = isManualCorrect;
    else if (type === 'multiple') {
      isCorrect = choice.split('').sort().join('') === q.answer.split('').sort().join('');
    } else {
      isCorrect = choice === q.answer;
    }

    setStats(prev => {
      const bankStats = prev[currentBank.id] || {};
      const qStat = bankStats[q.id] || { correct: 0, total: 0, lastChoice: null };
      return {
        ...prev,
        [currentBank.id]: {
          ...bankStats,
          [q.id]: {
            correct: qStat.correct + (isCorrect ? 1 : 0),
            total: qStat.total + 1,
            lastChoice: choice 
          }
        }
      };
    });

    if (settings.autoNext && isCorrect && currentIndex < questions.length - 1 && mode !== 'study') {
      setTimeout(() => navigate(1), 500);
    }
  };

  const copyQuestion = (q) => {
    const type = getQuestionType(q);
    const label = { single: '单选', multiple: '多选', judge: '判断', short: '简答' }[type];
    let textToCopy = `[${label}] ${q.title}\n`;
    if (q.option?.length > 0) textToCopy += q.option.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
    
    const textArea = document.createElement("textarea");
    textArea.value = textToCopy;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); showToast("已复制到剪贴板"); } 
    catch (err) { showToast("复制失败"); }
    document.body.removeChild(textArea);
  };

  // --- UI 组件 ---

  const ResumePrompt = () => (
    <AnimatePresence>
      {resumeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl text-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <History className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold dark:text-white mb-2">继续上次进度？</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">检测到你上次答到第 <span className="text-blue-600 font-bold">{resumeModal.index + 1}</span> 题，是否继续？</p>
            <div className="space-y-3">
              <button onClick={() => startQuiz(resumeModal.bank, resumeModal.mode, resumeModal.index)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold active:scale-95 transition-all">从断点继续</button>
              <button onClick={() => startQuiz(resumeModal.bank, resumeModal.mode, 0)} className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-2xl font-bold active:scale-95 transition-all">重新开始</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  const Sidebar = () => (
    <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-gray-900 shadow-2xl z-[150] transform transition-transform duration-300 ease-in-out ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="p-6 h-full flex flex-col">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-xl font-bold dark:text-white flex items-center gap-2 tracking-tight"><Settings className="w-5 h-5"/> 配置选项</h2>
          <button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"><X className="dark:text-white"/></button>
        </div>
        <div className="flex-1 space-y-8 overflow-y-auto pr-1 no-scrollbar">
          <section>
            <label className="text-xs font-bold text-gray-400 uppercase mb-3 block tracking-widest">主题显示</label>
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
            <label className="text-xs font-bold text-gray-400 uppercase block tracking-widest">做题偏好</label>
            {[
              { label: '答对自动跳转', key: 'autoNext' },
              { label: '未做题优先', key: 'unvisitedFirst' },
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
            <label className="text-xs font-bold text-gray-400 mb-3 block flex justify-between tracking-widest">内容字体 <span>{settings.fontSize}px</span></label>
            <input type="range" min="14" max="28" value={settings.fontSize} onChange={e => setSettings(s => ({...s, fontSize: parseInt(e.target.value)}))} className="w-full accent-blue-500 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer" />
          </section>
          <section className="space-y-3 pt-4 border-t dark:border-gray-800">
            <label className="w-full py-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border border-indigo-100 dark:border-indigo-900/30 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all">
              <FileUp className="w-4 h-4"/> 导入备份记录
              <input type="file" className="hidden" accept=".json" onChange={importBackup} />
            </label>
            <button onClick={() => { setStats({}); setProgress({}); showToast("已清除所有刷题进度"); }} className="w-full py-3 bg-red-50 dark:bg-red-900/10 text-red-600 border border-red-100 dark:border-red-900/30 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Eraser className="w-4 h-4"/> 清除做题记录
            </button>
            <button onClick={() => { if(window.confirm('此操作将清空所有题库和设置，确定吗？')){ localStorage.clear(); window.location.reload(); } }} className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-xl font-bold active:scale-95 transition-all text-xs">清除所有记录并初始化</button>
            <button onClick={() => { const d = { banks, stats, settings, progress }; const b = new Blob([JSON.stringify(d)], {type:'application/json'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download=`quiz_backup_${new Date().toLocaleDateString()}.json`; a.click(); }} className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95">
              <Download className="w-4 h-4"/> 导出备份
            </button>
          </section>
        </div>
      </div>
    </div>
  );

  const HomeView = () => (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        <header className="flex justify-between items-center py-8">
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter uppercase italic">Quiz Master</h1>
          <button onClick={() => setIsDrawerOpen(true)} className="p-2 bg-white dark:bg-gray-900 rounded-xl shadow-sm border dark:border-gray-800 active:scale-90 transition-transform"><Settings className="dark:text-gray-400"/></button>
        </header>
        <div className="grid grid-cols-1 gap-6 pb-20">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] shadow-sm border dark:border-gray-800">
            <h2 className="font-bold text-gray-400 text-xs uppercase tracking-widest mb-4">题库导入</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-all group">
                <Upload className="w-6 h-6 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xs font-bold text-gray-500">上传 JSON 文件</span>
                <input type="file" className="hidden" accept=".json" onChange={e => {
                  const f = e.target.files[0]; if(!f) return;
                  const r = new FileReader(); r.onload = ev => addBank(f.name, JSON.parse(ev.target.result)); r.readAsText(f);
                }} />
              </label>
              <div className="flex flex-col justify-center gap-2">
                <div className="relative">
                  <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
                  <input type="text" placeholder="URL 加载题库..." className="w-full pl-8 pr-4 py-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl text-xs dark:text-white outline-none focus:ring-1 ring-blue-500" onKeyDown={e => {
                    if(e.key === 'Enter') { fetch(e.target.value).then(res => res.json()).then(data => addBank('远程题库', data)).catch(()=>showToast('加载失败')); }
                  }} />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="font-bold text-gray-400 text-xs uppercase tracking-widest px-2">本地仓库 ({banks.length})</h2>
            {banks.map(bank => (
              <div key={bank.id} className="bg-white dark:bg-gray-900 p-6 rounded-[2rem] border dark:border-gray-800 hover:shadow-xl hover:shadow-black/5 transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold dark:text-white">{bank.name}</h3>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">{bank.count} 题</span>
                      {progress[bank.id] > 0 && <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 px-2 py-0.5 rounded-full font-bold">已答至第 {progress[bank.id] + 1} 题</span>}
                    </div>
                  </div>
                  <button onClick={() => setBanks(prev => prev.filter(b => b.id !== bank.id))} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4"/></button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['sequence', 'random', 'study', 'mistake'].map(m => (
                    <button key={m} onClick={() => startQuiz(bank, m)} className={`py-2 text-[10px] font-black rounded-xl transition-all active:scale-95 ${
                      m === 'sequence' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' :
                      m === 'random' ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' :
                      m === 'study' ? 'bg-green-50 dark:bg-green-900/20 text-green-600' : 'bg-red-50 dark:bg-red-900/20 text-red-600'
                    }`}>
                      {m === 'sequence' ? '顺序' : m === 'random' ? '乱序' : m === 'study' ? '背题' : '错题'}
                    </button>
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
    const bankStats = stats[currentBank?.id] || {};
    const h = bankStats[q?.id] || { correct: 0, total: 0, lastChoice: null };
    const type = getQuestionType(q);
    const answered = h.total > 0;
    const showResult = answered || mode === 'study';

    const displayOptions = useMemo(() => {
      if (type === 'judge' && (!q.option || q.option.length === 0)) {
        return (q.answer === '对' || q.answer === '错') ? ['对', '错'] : ['正确', '错误'];
      }
      return q.option || [];
    }, [q, type]);

    if (!q) return null;

    return (
      <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col fixed inset-0 z-10 overflow-hidden">
        <header className="p-4 flex items-center justify-between border-b dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-50">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('home')} className="p-2 dark:text-white active:scale-90"><ChevronLeft/></button>
            <div className="text-sm font-bold dark:text-white line-clamp-1 max-w-[120px]">{currentBank.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">{currentIndex + 1} / {questions.length}</span>
            <button onClick={() => setIsSheetOpen(true)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg active:scale-90"><Menu className="w-5 h-5 dark:text-white"/></button>
            <button onClick={() => setIsDrawerOpen(true)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg active:scale-90"><Settings className="w-5 h-5 dark:text-white"/></button>
          </div>
        </header>

        {/* 关键修复点：将滚动容器固定在 motion.div 外部 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
          <div className="relative min-h-full">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                variants={{
                  enter: (d) => ({ x: d > 0 ? '100%' : d < 0 ? '-100%' : 0, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d) => ({ x: d > 0 ? '-100%' : d < 0 ? '100%' : 0, opacity: 0 })
                }}
                custom={direction}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(e, i) => { if(i.offset.x > 50) navigate(-1); else if(i.offset.x < -50) navigate(1); }}
                className="w-full p-6 pb-32 touch-pan-y"
              >
                <div className="max-w-2xl mx-auto">
                  <motion.div whileTap={{ scale: 0.98 }} onClick={() => copyQuestion(q)} className="font-bold text-gray-800 dark:text-gray-100 leading-relaxed mb-8 cursor-pointer p-3 -m-3 rounded-2xl transition-all relative group" style={{ fontSize: `${settings.fontSize}px` }}>
                    <span className={`inline-block text-white text-[10px] px-2 py-0.5 rounded mr-2 align-middle font-bold ${
                      type === 'single' ? 'bg-blue-600' : type === 'multiple' ? 'bg-indigo-600' : type === 'judge' ? 'bg-purple-600' : 'bg-gray-600'
                    }`}>
                      {type === 'single' ? '单选' : type === 'multiple' ? '多选' : type === 'judge' ? '判断' : '简答'}
                    </span>
                    {q.title}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"><Copy className="w-3 h-3 text-gray-300"/></div>
                  </motion.div>

                  <div className="space-y-3">
                    {type === 'short' ? (
                      <div className="space-y-4">
                        <textarea value={shortAnswerText} onChange={e => setShortAnswerText(e.target.value)} disabled={showResult} placeholder="在此录入您的简答内容..." className="w-full h-44 p-5 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-3xl text-sm focus:ring-2 ring-blue-500 outline-none transition-all dark:text-white resize-none shadow-inner" />
                        {!showResult && !showShortResult && (
                          <button onClick={() => setShowShortResult(true)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 shadow-lg shadow-blue-500/20">查看标准解析 <Send className="w-4 h-4"/></button>
                        )}
                      </div>
                    ) : (
                      displayOptions.map((opt, idx) => {
                        const char = String.fromCharCode(65 + idx);
                        const optionValue = type === 'judge' ? opt : char;
                        const isUserSelection = type === 'multiple' ? multiSelect.includes(char) : h.lastChoice === optionValue;
                        
                        let isCorrect = false;
                        if (type === 'multiple') isCorrect = q.answer.includes(char);
                        else if (type === 'judge') isCorrect = opt === q.answer;
                        else isCorrect = char === q.answer;

                        let cls = "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400";
                        let circleCls = "border-gray-200 dark:border-gray-700 text-gray-400";

                        if (showResult) {
                          if (isCorrect) {
                            cls = "bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-400";
                            circleCls = "bg-green-500 border-green-500 text-white";
                          } else if (isUserSelection) {
                            cls = "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400";
                            circleCls = "bg-red-500 border-red-500 text-white";
                          }
                        } else if (type === 'multiple' && multiSelect.includes(char)) {
                          cls = "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600";
                          circleCls = "bg-blue-500 border-blue-500 text-white";
                        }

                        return (
                          <button key={idx} disabled={showResult} onClick={() => {
                            if(type === 'multiple') setMultiSelect(prev => prev.includes(char) ? prev.filter(c => c !== char) : [...prev, char]);
                            else handleAnswer(optionValue);
                          }} className={`w-full text-left p-5 rounded-[1.5rem] border-2 transition-all flex items-start gap-4 active:scale-[0.99] ${cls}`}>
                            <span className={`flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold border-2 transition-all ${circleCls}`}>
                              {type === 'judge' ? (opt.includes('对') || opt.includes('正确') ? '√' : '×') : char}
                            </span>
                            <span style={{ fontSize: `${settings.fontSize}px` }}>{opt}</span>
                          </button>
                        );
                      })
                    )}

                    {type === 'multiple' && !showResult && (
                      <button onClick={() => handleAnswer(multiSelect.sort().join(''))} disabled={multiSelect.length === 0} className="w-full py-4 mt-4 bg-indigo-600 text-white rounded-2xl font-bold active:scale-95 shadow-lg shadow-indigo-500/20">确认</button>
                    )}
                  </div>

                  {(showResult || showShortResult) && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 p-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2rem] border border-blue-100 dark:border-blue-900/30">
                      <div className="text-blue-600 dark:text-blue-400 font-bold mb-3 flex items-center gap-2 uppercase text-xs tracking-widest"><CheckCircle2 className="w-4 h-4"/> 详情</div>
                      <div className="text-gray-800 dark:text-gray-200 font-black mb-3" style={{ fontSize: `${settings.fontSize}px` }}>答案：{q.answer}</div>
                      {q.analysis && <p className="text-sm text-gray-500 dark:text-gray-400 italic pt-3 border-t dark:border-gray-800">{q.analysis}</p>}
                      
                      {type === 'short' && !answered && (
                        <div className="mt-6 flex gap-3">
                          <button onClick={() => handleAnswer(null, true)} className="flex-1 py-4 bg-green-500 text-white rounded-xl font-bold active:scale-95 shadow-lg shadow-green-500/10"><ThumbsUp className="w-4 h-4"/> 我答对了</button>
                          <button onClick={() => handleAnswer(null, false)} className="flex-1 py-4 bg-red-500 text-white rounded-xl font-bold active:scale-95 shadow-lg shadow-red-500/10"><ThumbsDown className="w-4 h-4"/> 我答错了</button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-white dark:from-gray-950 via-white/80 pointer-events-none flex justify-center">
          <div className="w-full max-w-md flex gap-4 pointer-events-auto">
            <button onClick={() => navigate(-1)} disabled={currentIndex === 0} className="flex-1 py-4 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-2xl font-bold shadow-xl shadow-black/5 dark:text-white disabled:opacity-20 transition-all"><ChevronLeft className="w-4 h-4 inline mr-1"/> 上一题</button>
            <button onClick={() => navigate(1)} disabled={currentIndex === questions.length - 1} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-20 transition-all font-bold">下一题 <ChevronRight className="w-4 h-4 inline ml-1"/></button>
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
          <h3 className="text-xl font-black dark:text-white uppercase italic tracking-tighter">进度概览</h3>
          <button onClick={() => setIsSheetOpen(false)} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full dark:text-white active:scale-90"><X/></button>
        </div>
        <div className="flex-1 overflow-y-auto grid grid-cols-5 sm:grid-cols-8 gap-3 pb-6 pr-2 no-scrollbar">
          {questions.map((q, i) => {
            const bankStats = stats[currentBank?.id] || {};
            const h = bankStats[q.id];
            let dot = "bg-gray-50 dark:bg-gray-800 text-gray-400";
            if(h?.total > 0) dot = h.correct >= h.total ? "bg-green-500 text-white" : "bg-red-500 text-white";
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
      <ResumePrompt />

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: -50, opacity: 0, x: '-50%' }} animate={{ y: 20, opacity: 1, x: '-50%' }} exit={{ y: -50, opacity: 0, x: '-50%' }} className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 bg-gray-900/90 dark:bg-blue-600/90 backdrop-blur-md text-white rounded-full shadow-2xl flex items-center gap-2 text-sm font-bold whitespace-nowrap">
            <Check className="w-4 h-4 text-green-400" /> {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {isDrawerOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] transition-opacity" onClick={() => setIsDrawerOpen(false)} />}
    </div>
  );
}

// Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swCode = `self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));`;
    const blob = new Blob([swCode], { type: 'text/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob));
  });
}
