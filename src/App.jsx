import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings, ChevronLeft, ChevronRight, Upload, Link as LinkIcon, 
  Trash2, BookOpen, Zap, RotateCcw, AlertCircle, Menu, X, 
  CheckCircle2, Download, Moon, Sun, Monitor, Type, Eraser, 
  Copy, Check, Send, ThumbsUp, ThumbsDown, History, FileUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- 常量与版本号 ---
const APP_ID = 'smart-quiz-v13';
const APP_VERSION = 'v1.3.0'; 
const DEFAULT_SETTINGS = {
  theme: 'auto', autoNext: true, unvisitedFirst: false, mistakeFirst: false, fontSize: 18, autoRemoveMistake: true
};

// --- 工具函数 ---
const getQuestionType = (q) => {
  if (!q) return '单选';
  const ans = String(q.answer || '').trim();
  const options = q.option || [];
  const isJudgeAns = ['正确', '错误', '对', '错'].includes(ans);
  const isJudgeOpts = options.length === 2 && options.every(o => ['正确', '错误', '对', '错'].includes(o));
  if (isJudgeAns || isJudgeOpts) return '判断';
  if (options.length === 0) return '简答';
  if (ans.length > 1 && /^[A-Z]+$/.test(ans)) return '多选';
  return '单选';
};

const getLabelColor = (type) => {
  switch (type) {
    case '单选': return 'bg-blue-600';
    case '多选': return 'bg-indigo-600';
    case '判断': return 'bg-purple-600';
    case '简答': return 'bg-gray-600';
    default: return 'bg-blue-600';
  }
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
  const [sessionAnswers, setSessionAnswers] = useState({}); // 用于错题模式下当作新题做

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [direction, setDirection] = useState(0); 
  const [toast, setToast] = useState(null);
  const [resumeModal, setResumeModal] = useState(null);

  const [multiSelect, setMultiSelect] = useState([]);
  const [shortAnswerText, setShortAnswerText] = useState("");
  const [showShortResult, setShowShortResult] = useState(false);

  const scrollRef = useRef(null);

  // 初始化强制深色模式类策略（修复部分环境无tailwindcss配置文件的情况）
  useEffect(() => {
    const script = document.createElement('script');
    script.innerHTML = `if (window.tailwind) window.tailwind.config = { darkMode: 'class' };`;
    document.head.appendChild(script);
  }, []);

  // 初始化
  useEffect(() => {
    const savedBanks = localStorage.getItem(`${APP_ID}-banks`);
    const savedSettings = localStorage.getItem(`${APP_ID}-settings`);
    const savedStats = localStorage.getItem(`${APP_ID}-stats`);
    const savedProgress = localStorage.getItem(`${APP_ID}-progress`);

    if (savedBanks) setBanks(JSON.parse(savedBanks));
    if (savedSettings) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(savedSettings) });
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
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      let isDark = settings.theme === 'dark';
      if (settings.theme === 'auto') isDark = mediaQuery.matches;
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    };
    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const addBank = (filename, data) => {
    const bankId = filename.replace('.json', '');
    // 保障每个题都有唯一ID
    const processedData = data.map((q, i) => ({ ...q, id: q.id || `q_${bankId}_${i}` }));
    const newBank = { id: bankId, name: bankId, data: processedData, count: processedData.length };
    setBanks(prev => [newBank, ...prev.filter(b => b.id !== bankId)]);
    showToast(`导入题库成功`);
  };

  const importBackup = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const backup = JSON.parse(event.target.result);
        if (backup.banks) setBanks(backup.banks);
        if (backup.settings) setSettings(backup.settings);
        if (backup.progress) setProgress(backup.progress);
        if (backup.stats) setStats(backup.stats);
        showToast("备份恢复成功");
      } catch (err) { showToast("导入失败"); }
    };
    reader.readAsText(file);
  };

  const handleClearStats = () => {
    setStats(prev => {
      const newStats = {};
      Object.keys(prev).forEach(bankId => {
        newStats[bankId] = {};
        Object.keys(prev[bankId]).forEach(qId => {
          if (prev[bankId][qId].everWrong) {
            newStats[bankId][qId] = { correct: 0, total: 0, lastChoice: null, everWrong: true };
          }
        });
      });
      return newStats;
    });
    setProgress({});
    showToast("记录已重置（错题已保留）");
  };

  const startQuiz = (bank, startMode, forcedIndex = null) => {
    if (forcedIndex === null && progress[bank.id] > 0 && startMode === 'sequence') {
      setResumeModal({ bank, mode: startMode, index: progress[bank.id] });
      return;
    }

    setCurrentBank(bank);
    setMode(startMode);
    setSessionAnswers({}); // 每次进入题库清空会话答题记录
    let base = [...bank.data];
    const bankStats = stats[bank.id] || {};

    if (startMode !== 'random' && startMode !== 'mistake' && startMode !== 'frequentMistake') {
      if (settings.mistakeFirst) {
        const mistakes = base.filter(q => bankStats[q.id]?.everWrong);
        const others = base.filter(q => !bankStats[q.id]?.everWrong);
        base = [...mistakes, ...others];
      }
      if (settings.unvisitedFirst) {
        const unvisited = base.filter(q => !(bankStats[q.id]?.total > 0));
        const visited = base.filter(q => bankStats[q.id]?.total > 0);
        base = [...unvisited, ...visited];
      }
    }

    if (startMode === 'random') {
      for (let i = base.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [base[i], base[j]] = [base[j], base[i]];
      }
    } else if (startMode === 'mistake') {
      base = base.filter(q => bankStats[q.id]?.everWrong);
      if (base.length === 0) return showToast("暂无错题，好厉害！");
    } else if (startMode === 'frequentMistake') {
      base = base.filter(q => {
        const s = bankStats[q.id];
        return s && s.total > 0 && ((s.total - s.correct) / s.total) > 0.4;
      });
      if (base.length === 0) return showToast("暂无高频错题");
    }

    setQuestions(base);
    setCurrentIndex(forcedIndex !== null ? forcedIndex : 0);
    setDirection(0);
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
      setTimeout(() => {
        setCurrentIndex(nextIdx);
        resetTempStates();
        if (mode === 'sequence') setProgress(prev => ({ ...prev, [currentBank.id]: nextIdx }));
      }, 0);
    }
  };

  const handleAnswer = (choice, isManualCorrect = null) => {
    const q = questions[currentIndex];
    const type = getQuestionType(q);
    let isCorrect = false;

    if (type === '简答') isCorrect = isManualCorrect;
    else if (type === '多选') isCorrect = choice.split('').sort().join('') === q.answer.split('').sort().join('');
    else isCorrect = choice === q.answer;

    const isMistakeMode = mode === 'mistake' || mode === 'frequentMistake';

    setStats(prev => {
      const bStats = prev[currentBank.id] || {};
      const qS = bStats[q.id] || { correct: 0, total: 0, lastChoice: null, everWrong: false };
      return { 
        ...prev, 
        [currentBank.id]: { 
          ...bStats, 
          [q.id]: { 
            correct: qS.correct + (isCorrect ? 1 : 0), 
            total: qS.total + 1, 
            lastChoice: choice,
            everWrong: !isCorrect ? true : qS.everWrong // 只要错一次，以后都是错题
          } 
        } 
      };
    });

    if (isMistakeMode) {
      setSessionAnswers(prev => ({ ...prev, [q.id]: { isCorrect, choice } }));
    }

    const willRemove = isMistakeMode && isCorrect && settings.autoRemoveMistake;

    if (willRemove) {
      // 从错题本除名
      setStats(prev => {
        const bStats = prev[currentBank.id] || {};
        const qS = bStats[q.id] || {};
        return { ...prev, [currentBank.id]: { ...bStats, [q.id]: { ...qS, everWrong: false } } };
      });
      
      setTimeout(() => {
        setQuestions(prev => {
          const nextQs = prev.filter(item => item.id !== q.id);
          if (nextQs.length === 0) {
            setView('home');
            showToast("错题已全部清空，太棒了！");
          } else if (currentIndex >= nextQs.length) {
            setCurrentIndex(Math.max(0, nextQs.length - 1));
          }
          return nextQs;
        });
        resetTempStates();
      }, 400);
    } else if (settings.autoNext && isCorrect && currentIndex < questions.length - 1 && mode !== 'study') {
      setTimeout(() => navigate(1), 400);
    }
  };

  const copyQuestion = (q) => {
    const type = getQuestionType(q);
    let text = `[${type}] ${q.title}\n`;
    if (q.option?.length > 0) text += q.option.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n');
    navigator.clipboard.writeText(text).then(() => showToast("已复制到剪贴板"));
  };

  const pageVariants = {
    enter: (d) => ({ x: d > 0 ? '50%' : d < 0 ? '-50%' : 0, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? '-50%' : d < 0 ? '50%' : 0, opacity: 0 })
  };

  const pageTransition = { x: { type: "spring", stiffness: 1000, damping: 60, mass: 0.8 }, opacity: { duration: 0.1 } };

  const currentQ = questions[currentIndex];
  const currentQId = currentQ?.id;
  const h = (stats[currentBank?.id] || {})[currentQId] || { total: 0, lastChoice: null };
  const isMistakeMode = mode === 'mistake' || mode === 'frequentMistake';
  const isAnswered = isMistakeMode ? !!sessionAnswers[currentQId] : (h.total > 0 || mode === 'study');

  return (
    <div className="font-sans selection:bg-blue-100 dark:selection:bg-blue-900 overflow-hidden relative min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-300">
      
      {/* 首页 */}
      {view === 'home' && (
        <div className="min-h-screen flex flex-col items-center p-6">
          <div className="w-full max-w-2xl">
            <header className="flex justify-between items-start py-10">
              <div>
                <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tighter uppercase italic">Quiz Master</h1>
                <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-widest px-1 opacity-60">Version: {APP_VERSION}</p>
              </div>
              <button onClick={() => setIsDrawerOpen(true)} className="p-3 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border dark:border-gray-800 active:scale-90 transition-all"><Settings className="dark:text-gray-300 w-6 h-6"/></button>
            </header>

            <div className="grid grid-cols-1 gap-6 pb-24">
              <div className="bg-white dark:bg-gray-900 p-8 rounded-[2.5rem] shadow-sm border dark:border-gray-800 relative overflow-hidden group">
                <h2 className="font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] mb-4">库文件管理</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-3xl hover:bg-blue-50 dark:hover:bg-blue-900/10 cursor-pointer transition-all group">
                    <Upload className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-xs font-black text-gray-400 uppercase tracking-tighter">上传 JSON</span>
                    <input type="file" className="hidden" accept=".json" onChange={e => {
                      const f = e.target.files[0]; if(!f) return;
                      const r = new FileReader(); r.onload = ev => addBank(f.name, JSON.parse(ev.target.result)); r.readAsText(f);
                    }} />
                  </label>
                  <div className="flex flex-col justify-center gap-3">
                    <div className="relative">
                      <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="text" placeholder="URL 加载..." className="w-full pl-11 pr-4 py-4 bg-gray-50 dark:bg-gray-800 border-none rounded-2xl text-xs dark:text-white outline-none focus:ring-2 ring-blue-500 transition-all" onKeyDown={e => {
                        if(e.key === 'Enter') { fetch(e.target.value).then(res => res.json()).then(data => addBank('网络题库', data)).catch(()=>showToast('解析失败')); }
                      }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="font-black text-gray-400 text-[10px] uppercase tracking-[0.2em] px-2">本地仓库 ({banks.length})</h2>
                {banks.map(bank => (
                  <div key={bank.id} className="bg-white dark:bg-gray-900 p-6 rounded-[2.5rem] border dark:border-gray-800 hover:shadow-xl transition-all">
                    <div className="flex justify-between items-start mb-5 px-1">
                      <div>
                        <h3 className="font-black dark:text-white text-lg tracking-tight">{bank.name}</h3>
                        <div className="flex gap-2 mt-1.5">
                          <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full font-bold uppercase">{bank.count} 题目</span>
                          {progress[bank.id] > 0 && <span className="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-black uppercase shadow-lg shadow-blue-500/20">第 {progress[bank.id] + 1} 题</span>}
                        </div>
                      </div>
                      <button onClick={() => setBanks(prev => prev.filter(b => b.id !== bank.id))} className="p-2 text-gray-200 hover:text-red-500 transition-colors"><Trash2 className="w-5 h-5"/></button>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { id: 'sequence', label: '顺序', style: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' },
                        { id: 'random', label: '乱序', style: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' },
                        { id: 'study', label: '背题', style: 'bg-green-50 dark:bg-green-900/20 text-green-600' },
                        { id: 'mistake', label: '错题', style: 'bg-red-50 dark:bg-red-900/20 text-red-500' },
                        { id: 'frequentMistake', label: '常错', style: 'bg-orange-50 dark:bg-orange-900/20 text-orange-600' }
                      ].map(m => (
                        <button key={m.id} onClick={() => startQuiz(bank, m.id)} className={`py-3 text-[10px] font-black rounded-2xl transition-all active:scale-90 uppercase ${m.style}`}>{m.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 刷题视图 */}
      {view === 'quiz' && currentQ && (
        <div className="min-h-screen flex flex-col fixed inset-0 z-10 overflow-hidden bg-white dark:bg-gray-950 transition-colors duration-300">
          <header className="p-4 flex items-center justify-between border-b dark:border-gray-800 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md z-50">
            <div className="flex items-center gap-3">
              <button onClick={() => setView('home')} className="p-2 dark:text-white active:scale-90 transition-transform"><ChevronLeft/></button>
              <div className="text-sm font-black dark:text-white line-clamp-1 max-w-[120px] uppercase tracking-tighter">{currentBank.name}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black bg-gray-100 dark:bg-gray-900 text-gray-500 px-3 py-1 rounded-full uppercase tracking-widest">{currentIndex + 1} / {questions.length}</span>
              <button onClick={() => setIsSheetOpen(true)} className="p-2 bg-gray-50 dark:bg-gray-900 rounded-xl border dark:border-gray-800"><Menu className="w-5 h-5 dark:text-white"/></button>
              <button onClick={() => setIsDrawerOpen(true)} className="p-2 bg-gray-50 dark:bg-gray-900 rounded-xl border dark:border-gray-800"><Settings className="w-5 h-5 dark:text-white"/></button>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar scroll-smooth">
            <div className="relative min-h-full">
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                <motion.div
                  key={currentQId}
                  custom={direction}
                  variants={pageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={pageTransition}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.1}
                  onDragEnd={(e, i) => { if(i.offset.x > 50) navigate(-1); else if(i.offset.x < -50) navigate(1); }}
                  className="w-full p-6 pb-40 touch-pan-y"
                >
                  <div className="max-w-2xl mx-auto">
                    <motion.div whileTap={{ scale: 0.99 }} onClick={() => copyQuestion(currentQ)} className="font-black text-gray-900 dark:text-white leading-relaxed mb-10 cursor-pointer p-4 -m-4 rounded-3xl transition-all relative group" style={{ fontSize: `${settings.fontSize}px` }}>
                      <span className={`inline-block text-white text-[10px] px-2 py-0.5 rounded mr-3 align-middle font-black uppercase tracking-widest ${getLabelColor(getQuestionType(currentQ))}`}>
                        {getQuestionType(currentQ)}
                      </span>
                      {currentQ.title}
                    </motion.div>

                    <div className="space-y-3.5">
                      {getQuestionType(currentQ) === '简答' ? (
                        <div className="space-y-4">
                          <textarea value={shortAnswerText} onChange={e => setShortAnswerText(e.target.value)} disabled={isAnswered} placeholder="记录答案内容..." className="w-full h-48 p-6 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 rounded-[2rem] text-sm focus:ring-2 ring-blue-500 transition-all dark:text-white resize-none shadow-inner" />
                          {!isAnswered && !showShortResult && (
                            <button onClick={() => setShowShortResult(true)} className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black active:scale-95 shadow-lg shadow-blue-500/20 text-sm tracking-widest uppercase">查看参考解析</button>
                          )}
                        </div>
                      ) : (
                        (getQuestionType(currentQ) === '判断' && (!currentQ.option || currentQ.option.length === 0) ? (currentQ.answer === '对' || currentQ.answer === '错' ? ['对','错'] : ['正确','错误']) : currentQ.option || []).map((opt, idx) => {
                          const char = String.fromCharCode(65 + idx);
                          const type = getQuestionType(currentQ);
                          const optionValue = type === '判断' ? opt : char;
                          
                          let isUserSelection = false;
                          if (isMistakeMode) {
                            if (sessionAnswers[currentQId]) {
                              isUserSelection = sessionAnswers[currentQId].choice?.includes(optionValue) || sessionAnswers[currentQId].choice?.includes(char);
                            }
                          } else {
                            isUserSelection = h.lastChoice?.includes(optionValue) || h.lastChoice?.includes(char);
                          }

                          const isCorrect = type === '多选' ? currentQ.answer.includes(char) : (type === '判断' ? opt === currentQ.answer : char === currentQ.answer);

                          let cls = "bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400 shadow-sm shadow-black/5";
                          let circleCls = "border-gray-200 dark:border-gray-700 text-gray-400";
                          
                          if (isAnswered) {
                            if (isCorrect) { cls = "bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-400"; circleCls = "bg-green-500 border-green-500 text-white"; }
                            else if (isUserSelection) { cls = "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400"; circleCls = "bg-red-500 border-red-500 text-white"; }
                          } else if (type === '多选' && multiSelect.includes(char)) {
                            cls = "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600"; circleCls = "bg-blue-500 border-blue-500 text-white";
                          }

                          return (
                            <button key={idx} disabled={isAnswered} onClick={() => {
                              if(type === '多选') setMultiSelect(prev => prev.includes(char) ? prev.filter(c => c !== char) : [...prev, char]);
                              else handleAnswer(optionValue);
                            }} className={`w-full text-left p-6 rounded-[1.8rem] border-2 transition-all flex items-start gap-4 active:scale-[0.98] ${cls}`}>
                              <span className={`flex-shrink-0 w-6 h-6 rounded-xl flex items-center justify-center text-[10px] font-black border-2 transition-all ${circleCls}`}>
                                {type === '判断' ? (opt.includes('对') || opt.includes('正确') ? '√' : '×') : char}
                              </span>
                              <span className="font-bold" style={{ fontSize: `${settings.fontSize}px` }}>{opt}</span>
                            </button>
                          );
                        })
                      )}
                      {getQuestionType(currentQ) === '多选' && !isAnswered && (
                        <button onClick={() => handleAnswer(multiSelect.sort().join(''))} disabled={multiSelect.length === 0} className="w-full py-5 mt-4 bg-indigo-600 text-white rounded-[2rem] font-black active:scale-95 shadow-2xl shadow-indigo-500/20 tracking-widest uppercase disabled:opacity-50">确认选项</button>
                      )}
                    </div>

                    {(isAnswered || showShortResult || mode === 'study') && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-10 p-8 bg-blue-50/50 dark:bg-blue-900/10 rounded-[2.5rem] border border-blue-100 dark:border-blue-900/30">
                        <div className="text-blue-600 dark:text-blue-400 font-black mb-4 flex items-center gap-2 uppercase text-[10px] tracking-[0.3em]"><CheckCircle2 className="w-4 h-4"/> 题目解析</div>
                        <div className="text-gray-900 dark:text-white font-black mb-4 leading-tight" style={{ fontSize: `${settings.fontSize}px` }}>正确答案：{currentQ.answer}</div>
                        {currentQ.analysis && <p className="text-sm text-gray-500 dark:text-gray-400 font-medium italic pt-4 border-t dark:border-gray-800/50 leading-relaxed">{currentQ.analysis}</p>}
                        {getQuestionType(currentQ) === '简答' && !isAnswered && (
                          <div className="mt-8 flex gap-3">
                            <button onClick={() => handleAnswer(null, true)} className="flex-1 py-4 bg-green-500 text-white rounded-2xl font-black active:scale-95 shadow-xl shadow-green-500/20 flex items-center justify-center gap-2"><ThumbsUp className="w-4 h-4"/> 我做对了</button>
                            <button onClick={() => handleAnswer(null, false)} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black active:scale-95 shadow-xl shadow-red-500/20 flex items-center justify-center gap-2"><ThumbsDown className="w-4 h-4"/> 我做错了</button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="fixed bottom-0 inset-x-0 p-6 bg-gradient-to-t from-white dark:from-gray-950 via-white/80 dark:via-gray-950/80 pointer-events-none flex justify-center">
            <div className="w-full max-w-md flex gap-4 pointer-events-auto">
              <button onClick={() => navigate(-1)} disabled={currentIndex === 0} className="flex-1 py-5 bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-3xl font-black shadow-xl shadow-black/5 dark:text-white disabled:opacity-20 transition-all uppercase tracking-tighter flex items-center justify-center gap-1 active:scale-95"><ChevronLeft className="w-5 h-5"/> 上一题</button>
              <button onClick={() => navigate(1)} disabled={currentIndex === questions.length - 1} className="flex-1 py-5 bg-blue-600 dark:bg-blue-700 text-white rounded-3xl font-black shadow-2xl shadow-blue-500/20 active:scale-95 disabled:opacity-20 transition-all uppercase tracking-tighter flex items-center justify-center gap-1">下一题 <ChevronRight className="w-5 h-5"/></button>
            </div>
          </div>
        </div>
      )}

      <Sidebar isDrawerOpen={isDrawerOpen} setIsDrawerOpen={setIsDrawerOpen} settings={settings} setSettings={setSettings} handleClearStats={handleClearStats} showToast={showToast} importBackup={importBackup} banks={banks} stats={stats} progress={progress} setStats={setStats} setProgress={setProgress} />
      <AnswerSheet isSheetOpen={isSheetOpen} setIsSheetOpen={setIsSheetOpen} questions={questions} currentIndex={currentIndex} setCurrentIndex={setCurrentIndex} setDirection={setDirection} stats={stats} currentBank={currentBank} resetTempStates={resetTempStates} mode={mode} sessionAnswers={sessionAnswers} />
      <ResumePrompt resumeModal={resumeModal} setResumeModal={setResumeModal} startQuiz={startQuiz} />

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ y: -50, opacity: 0, x: '-50%' }} animate={{ y: 20, opacity: 1, x: '-50%' }} exit={{ y: -50, opacity: 0, x: '-50%' }} className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 bg-gray-900/90 dark:bg-blue-600/90 backdrop-blur-md text-white rounded-full shadow-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><Check className="w-3 h-3 text-green-400" /> {toast}</motion.div>
        )}
      </AnimatePresence>
      {isDrawerOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[90] transition-opacity" onClick={() => setIsDrawerOpen(false)} />}
    </div>
  );
}

// --- 子组件 ---

const Sidebar = ({ isDrawerOpen, setIsDrawerOpen, settings, setSettings, handleClearStats, showToast, importBackup, banks, stats, progress, setStats, setProgress }) => (
  <div className={`fixed inset-y-0 right-0 w-80 bg-white dark:bg-gray-950 shadow-2xl z-[150] transform transition-transform duration-300 ease-in-out border-l dark:border-gray-800 ${isDrawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-8"><h2 className="text-xl font-black dark:text-white flex items-center gap-2 tracking-tight"><Settings className="w-5 h-5"/> 系统配置</h2><button onClick={() => setIsDrawerOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-900 rounded-full dark:text-white"><X/></button></div>
      <div className="flex-1 space-y-8 overflow-y-auto pr-1 no-scrollbar">
        <section>
          <label className="text-[10px] font-black text-gray-400 uppercase mb-3 block tracking-[0.2em]">视觉主题</label>
          <div className="grid grid-cols-3 gap-2">{[ {id: 'light', icon: Sun, label: '浅色'}, {id: 'dark', icon: Moon, label: '深色'}, {id: 'auto', icon: Monitor, label: '自动'} ].map(t => (<button key={t.id} onClick={() => setSettings(s => ({...s, theme: t.id}))} className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all ${settings.theme === t.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-gray-100 dark:border-gray-800 text-gray-400'}`}><t.icon className="w-4 h-4"/><span className="text-[10px] font-bold">{t.label}</span></button>))}</div>
        </section>
        <section className="space-y-4">
          <label className="text-[10px] font-black text-gray-400 uppercase block tracking-[0.2em]">功能选项</label>
          {[ { label: '答对自动跳转', key: 'autoNext' }, { label: '答对移出错题本', key: 'autoRemoveMistake' }, { label: '未做题置顶', key: 'unvisitedFirst' }, { label: '错题置顶', key: 'mistakeFirst' } ].map(item => (
            <div key={item.key} className="flex justify-between items-center p-4 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-transparent dark:border-gray-800/50"><span className="text-sm font-bold dark:text-gray-200">{item.label}</span><button onClick={() => setSettings(s => ({...s, [item.key]: !s[item.key]}))} className={`w-10 h-5 rounded-full transition-colors relative ${settings[item.key] ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}><div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${settings[item.key] ? 'left-6' : 'left-1'}`} /></button></div>
          ))}
        </section>
        <section>
          <label className="text-[10px] font-black text-gray-400 mb-3 block flex justify-between tracking-[0.2em] uppercase">文本字体 <span>{settings.fontSize}px</span></label>
          <div className="flex gap-3">
            <button onClick={() => setSettings(s => ({...s, fontSize: Math.max(14, s.fontSize - 2)}))} className="flex-1 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl font-black text-gray-600 dark:text-gray-300 active:scale-95 transition-all text-sm">A -</button>
            <button onClick={() => setSettings(s => ({...s, fontSize: Math.min(30, s.fontSize + 2)}))} className="flex-1 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl font-black text-gray-600 dark:text-gray-300 active:scale-95 transition-all text-sm">A +</button>
          </div>
        </section>
        <section className="space-y-3 pt-6 border-t dark:border-gray-800">
          <label className="w-full py-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all text-sm"><FileUp className="w-4 h-4"/> 导入备份<input type="file" className="hidden" accept=".json" onChange={importBackup} /></label>
          <button onClick={handleClearStats} className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-500 border border-red-100 dark:border-red-900/30 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 text-sm"><Eraser className="w-4 h-4"/> 清除做题记录 (保留错题)</button>
          <button onClick={() => { if(window.confirm('确定清空所有数据(包含错题本)？')){ localStorage.clear(); window.location.reload(); } }} className="w-full py-3 text-gray-400 dark:text-gray-600 font-bold text-[10px] uppercase text-center">清空一切并重置APP</button>
          <button onClick={() => { const d = { banks, stats, settings, progress }; const b = new Blob([JSON.stringify(d)], {type:'application/json'}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download=`backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); }} className="w-full py-4 bg-gray-900 dark:bg-white text-white dark:text-black rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl"><Download className="w-4 h-4"/> 导出完整备份</button>
        </section>
      </div>
    </div>
  </div>
);

const AnswerSheet = ({ isSheetOpen, setIsSheetOpen, questions, currentIndex, setCurrentIndex, setDirection, stats, currentBank, resetTempStates, mode, sessionAnswers }) => {
  const scrollContainerRef = useRef(null);
  
  // 自动居中当前题
  useEffect(() => {
    if (isSheetOpen) {
      const el = document.getElementById(`sheet-btn-${currentIndex}`);
      if (el && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const elRect = el.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const scrollTarget = el.offsetTop - containerRect.height / 2 + elRect.height / 2;
        container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      }
    }
  }, [isSheetOpen, currentIndex]);

  return (
    <div className={`fixed inset-0 z-[120] transition-all duration-300 ${isSheetOpen ? 'visible opacity-100' : 'invisible opacity-0'}`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSheetOpen(false)} />
      <motion.div initial={{ y: '100%' }} animate={{ y: isSheetOpen ? 0 : '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 260 }} className="absolute bottom-0 inset-x-0 bg-white dark:bg-gray-950 rounded-t-[3rem] p-8 max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border-t dark:border-gray-800">
        <div className="flex justify-between items-center mb-8 px-2"><h3 className="text-xl font-black dark:text-white uppercase italic tracking-tighter">进度概览</h3><button onClick={() => setIsSheetOpen(false)} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-2xl dark:text-white active:scale-90 transition-all"><X/></button></div>
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto grid grid-cols-5 sm:grid-cols-8 gap-3 pb-10 pr-2 no-scrollbar scroll-smooth">
          {questions.map((q, i) => {
            const h = (stats[currentBank?.id] || {})[q.id];
            const isMistakeMode = mode === 'mistake' || mode === 'frequentMistake';
            let dot = "bg-gray-50 dark:bg-gray-900 text-gray-400 border border-transparent dark:border-gray-800";
            
            if (isMistakeMode) {
              if (sessionAnswers[q.id]) {
                dot = sessionAnswers[q.id].isCorrect ? "bg-green-500 text-white shadow-lg" : "bg-red-500 text-white shadow-lg";
              }
            } else if (h?.total > 0) {
              dot = h.correct >= h.total ? "bg-green-500 text-white shadow-lg" : "bg-red-500 text-white shadow-lg";
            }
            
            return (<button id={`sheet-btn-${i}`} key={i} onClick={() => { setDirection(0); setCurrentIndex(i); setIsSheetOpen(false); resetTempStates(); }} className={`h-12 rounded-2xl text-[10px] font-black transition-all active:scale-90 ${dot} ${i === currentIndex ? 'ring-4 ring-blue-500 ring-offset-2 dark:ring-offset-gray-950' : ''}`}>{i + 1}</button>);
          })}
        </div>
      </motion.div>
    </div>
  );
};

const ResumePrompt = ({ resumeModal, setResumeModal, startQuiz }) => (
  <AnimatePresence>
    {resumeModal && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/60 backdrop-md" onClick={() => setResumeModal(null)} />
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl text-center border border-gray-100 dark:border-gray-800">
          <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><History className="w-8 h-8" /></div>
          <h3 className="text-xl font-black dark:text-white mb-2 tracking-tight">恢复进度？</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 font-medium">上次练习到第 <span className="text-blue-600 font-bold">{resumeModal.index + 1}</span> 题</p>
          <div className="space-y-3">
            <button onClick={() => startQuiz(resumeModal.bank, resumeModal.mode, resumeModal.index)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold active:scale-95 shadow-lg shadow-blue-500/20">从断点继续</button>
            <button onClick={() => startQuiz(resumeModal.bank, resumeModal.mode, 0)} className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 rounded-2xl font-bold active:scale-95 transition-all">重新开始</button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

// --- PWA Service Worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swCode = `self.addEventListener('install', e => self.skipWaiting()); self.addEventListener('fetch', e => e.respondWith(fetch(e.request)));`;
    const blob = new Blob([swCode], { type: 'text/javascript' });
    navigator.serviceWorker.register(URL.createObjectURL(blob)).catch(() => {});
  });
}
