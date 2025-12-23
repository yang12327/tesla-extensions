import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Camera, Zap, Activity, Sun, Moon } from 'lucide-react';

export default function HomePage() {
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    // Check local storage or system preference
    const isDark = localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#232629] text-gray-900 dark:text-zinc-200 font-sans transition-colors duration-300">
      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-16 flex flex-col items-center relative">
          <div className="w-full flex justify-end absolute top-0 right-0 z-10">
             <button 
                onClick={toggleTheme}
                className="p-2 rounded-full bg-gray-200 dark:bg-[#313438] text-gray-600 dark:text-zinc-400 hover:bg-gray-300 dark:hover:bg-[#42454a] transition-colors cursor-pointer"
                aria-label="Toggle Theme"
            >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
         
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6 tracking-tight mt-8">
            Tesla <span className="text-red-600">Extensions</span>
          </h1>
          <p className="text-gray-600 dark:text-zinc-400 text-lg max-w-2xl mx-auto text-center">
            專為 Tesla 車主打造的實用工具集合，提升您的用車體驗。
          </p>
        </header>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Sentry Viewer Card */}
          <Link href="/camera" className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-zinc-600 rounded-2xl blur opacity-20 transition duration-500"></div>
            <div className="relative h-full bg-white dark:bg-[#313438] border border-gray-200 dark:border-[#42454a] rounded-xl p-8 hover:bg-gray-50 dark:hover:bg-[#3a3d42] transition-all duration-300 flex flex-col shadow-sm dark:shadow-none">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-gray-100 dark:bg-[#232629]/50 rounded-xl border border-gray-200 dark:border-[#42454a] transition-colors">
                  <Camera className="w-8 h-8 text-red-500" />
                </div>
                <div className="px-2 py-1 bg-gray-100 dark:bg-[#232629] rounded text-[10px] font-mono text-gray-500 dark:text-zinc-500 border border-gray-200 dark:border-[#42454a]">
                  v1.0
                </div>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 transition-colors">
                哨兵播放器
              </h2>
              <p className="text-gray-600 dark:text-zinc-400 text-sm leading-relaxed mb-6 flex-1">
                專業的行車記錄器與哨兵模式影片檢視工具。支援四鏡頭同步播放、地圖軌跡定位、事件類型篩選與快速截圖功能。
              </p>

              <div className="flex items-center text-sm text-red-500 font-medium transition-transform">
                開啟工具 <span className="ml-1">→</span>
              </div>
            </div>
          </Link>

          {/* Placeholder Card 1 */}
          <div className="group relative opacity-50 cursor-not-allowed">
            <div className="relative h-full bg-white dark:bg-[#313438] border border-gray-200 dark:border-[#42454a] rounded-xl p-8 flex flex-col border-dashed">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-gray-100 dark:bg-[#232629]/50 rounded-xl border border-gray-200 dark:border-[#42454a]">
                  <Zap className="w-8 h-8 text-gray-400 dark:text-zinc-600" />
                </div>
                <div className="px-2 py-1 bg-gray-100 dark:bg-[#232629] rounded text-[10px] font-mono text-gray-400 dark:text-zinc-600 border border-gray-200 dark:border-[#42454a]">
                  Coming Soon
                </div>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-400 dark:text-zinc-500 mb-3">
                充電分析
              </h2>
              <p className="text-gray-400 dark:text-zinc-600 text-sm leading-relaxed mb-6 flex-1">
                分析充電效率、成本估算與電池健康度監控工具。（開發中）
              </p>
            </div>
          </div>

          {/* Placeholder Card 2 */}
          <div className="group relative opacity-50 cursor-not-allowed">
            <div className="relative h-full bg-white dark:bg-[#313438] border border-gray-200 dark:border-[#42454a] rounded-xl p-8 flex flex-col border-dashed">
              <div className="flex items-start justify-between mb-6">
                <div className="p-3 bg-gray-100 dark:bg-[#232629]/50 rounded-xl border border-gray-200 dark:border-[#42454a]">
                  <Activity className="w-8 h-8 text-gray-400 dark:text-zinc-600" />
                </div>
                <div className="px-2 py-1 bg-gray-100 dark:bg-[#232629] rounded text-[10px] font-mono text-gray-400 dark:text-zinc-600 border border-gray-200 dark:border-[#42454a]">
                  Coming Soon
                </div>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-400 dark:text-zinc-500 mb-3">
                行程統計
              </h2>
              <p className="text-gray-400 dark:text-zinc-600 text-sm leading-relaxed mb-6 flex-1">
                詳細的行程記錄統計，包含能耗分析與駕駛評分。（開發中）
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <footer className="mt-20 pt-8 border-t border-gray-200 dark:border-[#313438] text-center text-gray-500 dark:text-zinc-600 text-sm">
          <p>© {new Date().getFullYear()} Tesla Extensions. Built for Tesla Owners.</p>
        </footer>
      </div>
    </div>
  );
}
