import { useMemo } from 'react';
import {
    ArrowUp,
    MapPin,
    Move
} from 'lucide-react';
import Tooltip from '../components/Tooltip';

/**
 * SEI 資料顯示面板組件
 * 在影片播放時顯示車輛狀態資訊
 */
export default function SeiDataPanel({ seiData }) {
    if (!seiData) {
        return null;
    }

    // GPS 資料
    const gpsData = useMemo(() => {
        if (seiData.latitudeDeg?.raw && seiData.longitudeDeg?.raw) {
            return {
                lat: seiData.latitudeDeg.raw.toFixed(6),
                lon: seiData.longitudeDeg.raw.toFixed(6),
            };
        }
        return null;
    }, [seiData]);

    // 加速度資料
    const accelData = useMemo(() => {
        const x = seiData.linearAccelerationMps2X?.raw;
        const y = seiData.linearAccelerationMps2Y?.raw;
        const z = seiData.linearAccelerationMps2Z?.raw;

        if (x !== undefined && y !== undefined) {
            const totalG = Math.sqrt(x * x + y * y) / 9.80665;
            return {
                x: x?.toFixed(1),
                y: y?.toFixed(1),
                z: z?.toFixed(1),
                totalG: totalG.toFixed(2),
            };
        }
        return null;
    }, [seiData]);

    // 航向
    const heading = seiData.headingDeg?.raw;

    return (
        <>
            {/* 分隔線 */}
            {(gpsData || accelData || heading !== undefined) && (
                <div className="border-t border-zinc-700 pt-2 space-y-1.5">
                    {/* GPS 航向 */}
                    {gpsData && (
                        <div className="flex items-center gap-2">
                            <ArrowUp size={12} className="text-blue-400 shrink-0" style={{ rotate: `${heading}deg` }} />
                            <Tooltip content={`GPS定位\n緯度：${gpsData.lat}\n經度：${gpsData.lon}\n航向：${heading.toFixed(1)}°`}>
                                <span className="font-mono text-xs">
                                    {gpsData.lat}, {gpsData.lon}
                                </span>
                            </Tooltip>
                        </div>
                    )}

                    {/* 加速度 */}
                    {accelData && (
                        <div className="flex items-center gap-2">
                            <Move size={12} className="text-purple-400 shrink-0" />
                            <Tooltip content={`加速度\n體感：${accelData.totalG} G\n左右：${accelData.x} m/s²\n前後：${accelData.y} m/s²`}>
                                <span className="font-mono text-xs">
                                    {accelData.totalG}G (X:{accelData.x} Y:{accelData.y})
                                </span>
                            </Tooltip>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

/**
 * 簡易速度計顯示
 */
export function SpeedDisplay({ seiData, more = false }) {
    if (!seiData) {
        return null;
    }

    return (
        <>
            {/* 主要數據網格 */}
            <div className="flex">
                <div className="flex-none w-auto flex flex-col justify-between">
                    {/* 檔位 */}
                    <Tooltip content={`檔位（${['停車', '前進', '倒車', '空'][seiData.gearState?.raw || 0]}檔）`}>
                        <div className={`w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm`}>
                            {['P', 'D', 'R', 'N'][seiData.gearState?.raw || 0]}
                        </div>
                    </Tooltip>

                    {/* 煞車踏板 */}
                    <Tooltip content="煞車踏板">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm ${seiData.brakeApplied?.raw ? 'bg-red-400' : 'bg-zinc-800'}`}>
                            <svg fill="currentColor" height="32" width="32">
                                <use href="/camera.svg#brake" />
                            </svg>
                        </div>
                    </Tooltip>
                </div>
                <div className="flex-none w-auto justify-center space-y-1 mx-2 self-center">
                    {/* 左方向燈 */}
                    <Tooltip content="左方向燈">
                        <div className={`w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm ${seiData.blinkerOnLeft?.raw ? 'blinker-blink' : 'text-green-700'}`}>
                            <svg fill="currentColor" height="16" width="16">
                                <use href="/camera.svg#blinker" />
                            </svg>
                        </div>
                    </Tooltip>
                </div>
                <div className="flex-1 flex flex-col text-center">
                    {/* 時速 */}
                    <Tooltip content={`時速（${(seiData.vehicleSpeedMps.raw * 3.6).toFixed(1)} 公里/小時）`}>
                        <strong>
                            {(seiData.vehicleSpeedMps.raw * 3.6).toFixed(1).split('.').map((part, i) => !i ?
                                (<span className="text-3xl">{part}</span>) :
                                more && (<>.{part}</>))}
                        </strong>
                    </Tooltip>
                    公里/小時
                </div>
                <div className="flex-none w-auto justify-center space-y-1 mx-2 self-center">
                    {/* 右方向燈 */}
                    <Tooltip content="右方向燈">
                        <div className={`w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm rotate-180 ${seiData.blinkerOnRight?.raw ? 'blinker-blink' : 'text-green-700'}`}>
                            <svg fill="currentColor" height="16" width="16">
                                <use href="/camera.svg#blinker" />
                            </svg>
                        </div>
                    </Tooltip>
                </div>
                <div className="flex-none w-auto flex flex-col justify-between">
                    {/* 方向盤 (輔助駕駛) */}
                    <div className='flex'>
                        {more && (
                            <div className='w-0 relative'>
                                <span className='absolute top-0 right-0 text-xs text-white'>{seiData.steeringWheelAngle?.raw.toFixed(1) || 0}°</span>
                            </div>
                        )}
                        <Tooltip content={`方向盤（${seiData.steeringWheelAngle?.raw.toFixed(1) || 0}°）${['', '\n全自動駕駛 FSD', '\n自動輔助駕駛 Autopilot', '\n主動巡航定速 TACC'][seiData.autopilotState?.raw || 0]}`}>
                            <div className={`w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm ${[1, 2].includes(seiData.autopilotState?.raw) && 'text-blue-500'} ${seiData.autopilotState?.raw === 3 && 'border-blue-500 border-3'}`}
                                style={{ rotate: `${seiData.steeringWheelAngle?.raw || 0}deg` }}>
                                <svg fill="currentColor" height="32" width="32">
                                    <use href="/camera.svg#steering" />
                                </svg>
                            </div>
                        </Tooltip>
                    </div>

                    {/* 加速踏板 */}
                    <div className='flex'>
                        {more && (
                            <div className='w-0 relative'>
                                <span className='absolute bottom-0 right-0 text-xs text-white'>{seiData.acceleratorPedalPosition?.raw.toFixed(0) || 0}%</span>
                            </div>
                        )}
                        <Tooltip content={`加速踏板（${seiData.acceleratorPedalPosition?.raw.toFixed(0) || 0}%）`}>
                            <div className={`w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-sm`}
                                style={{ background: `linear-gradient(to top, var(--color-zinc-200) ${seiData.acceleratorPedalPosition?.raw || 0}%, var(--color-zinc-800) ${seiData.acceleratorPedalPosition?.raw || 0}%)` }}>
                                <svg fill="currentColor" height="32" width="32">
                                    <use href="/camera.svg#accelerator" />
                                </svg>
                            </div>
                        </Tooltip>
                    </div>
                </div>
            </div>

        </>
    );
}
