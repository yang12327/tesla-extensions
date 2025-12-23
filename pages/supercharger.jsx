import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const APP_KEY = 'tesla_tracker_v3';
const HISTORY_KEY = 'tesla_map_history';

// Dynamically import Leaflet to avoid SSR issues
const MapContainer = dynamic(
    () => import('react-leaflet').then((mod) => mod.MapContainer),
    { ssr: false }
);
const TileLayer = dynamic(
    () => import('react-leaflet').then((mod) => mod.TileLayer),
    { ssr: false }
);
const Marker = dynamic(
    () => import('react-leaflet').then((mod) => mod.Marker),
    { ssr: false }
);
const useMap = dynamic(
    () => import('react-leaflet').then((mod) => mod.useMap),
    { ssr: false }
);

// Station data will be fetched from public/supercharger.json

export default function Supercharger() {
    const [allStations, setAllStations] = useState([]);
    const [timesMatrix, setTimesMatrix] = useState([]);
    const [isPlanningMode, setIsPlanningMode] = useState(false);
    const [selectedStationIds, setSelectedStationIds] = useState(new Set());
    const [routeStartCoords, setRouteStartCoords] = useState(null);
    const [routeEndCoords, setRouteEndCoords] = useState(null);
    const [mapPickTarget, setMapPickTarget] = useState(null);

    const [cityFilterNormal, setCityFilterNormal] = useState('');
    const [hideVisitedNormal, setHideVisitedNormal] = useState(false);
    const [cityFilterPlanner, setCityFilterPlanner] = useState('');
    const [hideVisitedPlanner, setHideVisitedPlanner] = useState(false);

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [currentStation, setCurrentStation] = useState({});
    const [resultModalOpen, setResultModalOpen] = useState(false);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [routeResult, setRouteResult] = useState([]);
    const [historyList, setHistoryList] = useState([]);
    const [loading, setLoading] = useState(false);

    const [startInputVal, setStartInputVal] = useState('');
    const [endInputVal, setEndInputVal] = useState('');

    const mapRef = useRef(null);

    // Check if visited this year
    const isVisitedThisYear = useCallback((id) => {
        if (typeof window === 'undefined') return false;
        const v = JSON.parse(localStorage.getItem(APP_KEY) || '{}');
        return v[id] && new Date(v[id]).getFullYear() === new Date().getFullYear();
    }, []);

    // Visited stats
    const visitedStats = useMemo(() => {
        const visited = allStations.filter(s => isVisitedThisYear(s.id));
        return { count: visited.length, total: allStations.length };
    }, [allStations, isVisitedThisYear]);

    // Progress percent
    const progressPercent = useMemo(() => {
        if (visitedStats.total === 0) return 0;
        return (visitedStats.count / visitedStats.total) * 100;
    }, [visitedStats]);

    // Cities list
    const cities = useMemo(() => {
        const uniqueCities = [...new Set(allStations.map(s => s.city))];
        const sortOrder = [
            "Taipei", "New Taipei", "Taoyuan", "Hsinchu",
            "Miaoli", "Taichung", "Changhua", "Nantou", "Yunlin",
            "Chiayi", "Tainan", "Kaohsiung", "Pingtung",
            "Taitung", "Hualien", "Yilan", "Keelung"
        ];

        const cityMap = {
            "Taipei": "台北市", "New Taipei": "新北市", "Keelung": "基隆市",
            "Yilan": "宜蘭縣", "Hualien": "花蓮縣", "Taitung": "台東縣",
            "Pingtung": "屏東縣", "Kaohsiung": "高雄市", "Tainan": "台南市",
            "Chiayi": "嘉義", "Yunlin": "雲林縣",
            "Nantou": "南投縣", "Changhua": "彰化縣", "Taichung": "台中市",
            "Miaoli": "苗栗縣", "Hsinchu": "新竹", "Taoyuan": "桃園市"
        };

        uniqueCities.sort((a, b) => {
            const indexA = sortOrder.indexOf(a);
            const indexB = sortOrder.indexOf(b);
            if (indexA === -1 && indexB === -1) return a.localeCompare(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });

        return uniqueCities.map(city => {
            const stationsInCity = allStations.filter(s => s.city === city);
            const total = stationsInCity.length;
            const visited = stationsInCity.filter(s => isVisitedThisYear(s.id)).length;
            const displayName = cityMap[city] || city;
            return {
                value: city,
                label: `${displayName} (${visited}/${total})`
            };
        });
    }, [allStations, isVisitedThisYear]);

    // Filtered stations
    const filteredStations = useMemo(() => {
        const city = isPlanningMode ? cityFilterPlanner : cityFilterNormal;
        const hide = isPlanningMode ? hideVisitedPlanner : hideVisitedNormal;

        return allStations.filter(s => {
            if (city && s.city !== city) return false;
            if (hide && isVisitedThisYear(s.id)) return false;
            return true;
        });
    }, [allStations, isPlanningMode, cityFilterNormal, cityFilterPlanner, hideVisitedNormal, hideVisitedPlanner, isVisitedThisYear]);

    // Google Maps links
    const googleMapsLinks = useMemo(() => {
        if (!routeResult.length) return [];
        const allPoints = [routeStartCoords, ...routeResult];
        const chunkSize = 9;
        const links = [];
        const totalLinks = Math.ceil((allPoints.length - 1) / chunkSize);

        for (let i = 0; i < allPoints.length - 1; i += chunkSize) {
            const chunkPoints = allPoints.slice(i, i + chunkSize + 1);
            if (chunkPoints.length < 2) break;

            const origin = chunkPoints[0];
            const destination = chunkPoints[chunkPoints.length - 1];
            const waypoints = chunkPoints.slice(1, -1);

            let url = `https://www.google.com/maps/dir/?api=1`;
            url += `&origin=${origin.lat},${origin.lng}`;
            url += `&destination=${destination.lat},${destination.lng}`;

            if (waypoints.length > 0) {
                url += `&waypoints=${waypoints.map(s => `${s.lat},${s.lng}`).join('|')}`;
            }
            url += `&travelmode=driving`;

            links.push({
                url,
                text: totalLinks > 1 ? `開啟 Google Maps 導航 (第 ${links.length + 1}/${totalLinks} 段)` : `開啟 Google Maps 導航`
            });
        }
        return links;
    }, [routeResult, routeStartCoords]);

    // Fetch stations
    useEffect(() => {
        const fetchStations = async () => {
            try {
                const response = await fetch('/supercharger.json');
                const jsonData = await response.json();

                const stations = jsonData.station
                    .filter(s => s.status === 'OPEN')
                    .map(s => ({
                        ...s,
                        lat: s.latitude,
                        lng: s.longitude,
                        address: s.street,
                        city: s.state
                    }));
                setAllStations(stations);
                setTimesMatrix(jsonData.times);
            } catch (error) {
                console.error("Failed to load station data", error);
            }
        };
        fetchStations();
    }, []);

    // Update input values when coords change
    useEffect(() => {
        if (routeStartCoords) {
            setStartInputVal(`${routeStartCoords.lat.toFixed(5)}, ${routeStartCoords.lng.toFixed(5)}`);
        } else {
            setStartInputVal('');
        }
    }, [routeStartCoords]);

    useEffect(() => {
        if (routeEndCoords) {
            setEndInputVal(`${routeEndCoords.lat.toFixed(5)}, ${routeEndCoords.lng.toFixed(5)}`);
        } else {
            setEndInputVal('');
        }
    }, [routeEndCoords]);

    // Handle start input change
    const handleStartInputChange = (val) => {
        setStartInputVal(val);
        const parts = val.split(',').map(p => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            setRouteStartCoords({ lat: parts[0], lng: parts[1] });
        }
    };

    // Handle end input change
    const handleEndInputChange = (val) => {
        setEndInputVal(val);
        const parts = val.split(',').map(p => parseFloat(p.trim()));
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            setRouteEndCoords({ lat: parts[0], lng: parts[1] });
        }
    };

    // Toggle route mode
    const toggleRouteMode = (val) => {
        setIsPlanningMode(val);
        if (!val) {
            setSelectedStationIds(new Set());
        }
    };

    // Toggle station selection
    const toggleStationSelection = (stationId) => {
        const newSet = new Set(selectedStationIds);
        if (newSet.has(stationId)) {
            newSet.delete(stationId);
        } else {
            newSet.add(stationId);
        }
        setSelectedStationIds(newSet);
    };

    // Open detail modal
    const openDetailModal = (station) => {
        setCurrentStation(station);
        setDetailModalOpen(true);
    };

    // Toggle checkin
    const toggleCheckin = () => {
        const s = currentStation;
        const visited = isVisitedThisYear(s.id);
        const v = JSON.parse(localStorage.getItem(APP_KEY) || '{}');
        if (visited) {
            delete v[s.id];
        } else {
            v[s.id] = new Date().toISOString();
        }
        localStorage.setItem(APP_KEY, JSON.stringify(v));
        setAllStations([...allStations]);
        setDetailModalOpen(false);
    };

    // Navigate to station
    const navigateTo = (station) => {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}&travelmode=driving`;
        window.open(url, '_blank');
    };

    // Select all filtered stations
    const selectAllFiltered = () => {
        const newSet = new Set(selectedStationIds);
        filteredStations.forEach(s => newSet.add(s.id));
        setSelectedStationIds(newSet);
    };

    // Use current location
    const useCurrentLocation = (target) => {
        if (!navigator.geolocation) {
            alert("瀏覽器不支援定位");
            return;
        }
        navigator.geolocation.getCurrentPosition((pos) => {
            const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            if (target === 'start') setRouteStartCoords(latlng);
            else setRouteEndCoords(latlng);
        });
    };

    // Calculate route
    const calculateRoute = async () => {
        if (!routeStartCoords || selectedStationIds.size === 0) {
            alert("請檢查起點座標與站點選擇。");
            return;
        }

        setLoading(true);
        try {
            let currentStationIdx = -1;
            let minDst = Infinity;
            allStations.forEach((s, i) => {
                const d = (s.lat - routeStartCoords.lat) ** 2 + (s.lng - routeStartCoords.lng) ** 2;
                if (d < minDst) {
                    minDst = d;
                    currentStationIdx = i;
                }
            });

            let nodes = allStations.filter(s => selectedStationIds.has(s.id));
            let routeOrder = [];

            while (nodes.length > 0) {
                let bestNodeIdx = -1;
                let minTime = Infinity;

                nodes.forEach((node, index) => {
                    const nodeOriginalIdx = allStations.indexOf(node);
                    if (nodeOriginalIdx !== -1) {
                        const time = timesMatrix[currentStationIdx]?.[nodeOriginalIdx];
                        if (time !== undefined && time < minTime) {
                            minTime = time;
                            bestNodeIdx = index;
                        }
                    }
                });

                if (bestNodeIdx === -1) break;

                const nextNode = nodes[bestNodeIdx];
                routeOrder.push({ ...nextNode, travelTime: `${Math.round(minTime)} 分鐘` });

                currentStationIdx = allStations.indexOf(nextNode);
                nodes.splice(bestNodeIdx, 1);
            }

            saveRouteToHistory(routeOrder);
            setRouteResult(routeOrder);
            setResultModalOpen(true);
        } catch (err) {
            alert("運算失敗：" + err.message);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Save route to history
    const saveRouteToHistory = (routeOrder) => {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const newItem = {
            id: Date.now(),
            date: new Date().toLocaleString(),
            start: routeStartCoords,
            stations: routeOrder
        };
        history.unshift(newItem);
        if (history.length > 20) history.pop();
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    };

    // Open history modal
    const openHistoryModal = () => {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        setHistoryList(history);
        setHistoryModalOpen(true);
    };

    // Delete history item
    const deleteHistoryItem = (index) => {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        history.splice(index, 1);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        setHistoryList(history);
    };

    // Load history route
    const loadHistoryRoute = (item) => {
        setRouteStartCoords(item.start);
        setRouteResult(item.stations);
        setResultModalOpen(true);
        setHistoryModalOpen(false);
    };

    // Handle map click
    const handleMapClick = (e) => {
        if (mapPickTarget) {
            const latlng = { lat: e.latlng.lat, lng: e.latlng.lng };
            if (mapPickTarget === 'start') setRouteStartCoords(latlng);
            else setRouteEndCoords(latlng);
            setMapPickTarget(null);
        }
    };

    // Handle marker click
    const handleMarkerClick = (station) => {
        if (isPlanningMode) {
            toggleStationSelection(station.id);
        } else {
            openDetailModal(station);
        }
    };

    return (
        <>
            <Head>
                <title>特斯拉超充踩點地圖</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
            </Head>

            <style jsx global>{`
                body { margin: 0; padding: 0; overflow: hidden; font-family: -apple-system, sans-serif; }
                #map { height: 100vh; width: 100vw; z-index: 0; }
                .custom-icon { display: flex; justify-content: center; align-items: center; background: transparent; }
                .pin {
                width: 30px; height: 30px; border-radius: 50% 50% 50% 0;
                background: #000; position: absolute; transform: rotate(-45deg);
                left: 50%; top: 50%; margin: -15px 0 0 -15px;
                box-shadow: 0 3px 5px rgba(0,0,0,0.3); border: 2px solid white;
                transition: all 0.2s ease;
                }
                .pin::after {
                content: ''; width: 14px; height: 14px; margin: 6px 0 0 6px;
                background: #fff; position: absolute; border-radius: 50%;
                }
                .pin.visited { background: #cc0000; z-index: 10; }
                .pin.selected { background: #2563eb !important; transform: scale(1.2) rotate(-45deg); z-index: 20; border-color: #fbbf24; }
                .cursor-crosshair { cursor: crosshair !important; }
            `}</style>

            <div className="bg-gray-100">
                {/* Normal Mode Header */}
                <div
                    id="header-normal"
                    className="absolute top-0 left-0 right-0 z-[1000] p-2 pointer-events-none flex flex-col items-center gap-2 transition-transform duration-300"
                    style={{ transform: isPlanningMode ? 'translateY(-100%)' : 'translateY(0)' }}
                >
                    <div className="bg-white/95 backdrop-blur shadow-md p-3 rounded-xl border border-gray-200 w-full max-w-2xl pointer-events-auto">
                        <div className="flex justify-between items-center mb-2">
                            <div>
                                <Link href="/">
                                    <h1 className="font-bold text-gray-800 text-base">
                                        <i className="fa-solid fa-bolt text-red-600 mr-1"></i> 超充踩點紀錄
                                    </h1>
                                </Link>
                                <p className="text-xs text-gray-500">
                                    今年進度: <span className="font-bold text-red-600">{visitedStats.count}</span> / <span>{visitedStats.total}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => toggleRouteMode(true)}
                                className="bg-blue-600 text-white text-sm px-3 py-2 rounded-lg shadow hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <i className="fa-solid fa-route"></i> <span>路線規劃</span>
                            </button>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                            <div className="bg-red-600 h-1.5 rounded-full" style={{ width: `${progressPercent}%` }}></div>
                        </div>

                        {/* Filter Section (Normal) */}
                        <div className="flex gap-2 items-center text-sm pt-1 border-t border-gray-100">
                            <select
                                value={cityFilterNormal}
                                onChange={(e) => setCityFilterNormal(e.target.value)}
                                className="border rounded px-2 py-1 bg-white text-gray-700 flex-1"
                            >
                                <option value="">全台灣</option>
                                {cities.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                            <label className="flex items-center gap-1 cursor-pointer select-none text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={hideVisitedNormal}
                                    onChange={(e) => setHideVisitedNormal(e.target.checked)}
                                />
                                <span>隱藏已踩</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Planner Mode Header */}
                <div
                    id="header-planner"
                    className="absolute top-0 left-0 right-0 z-[1000] p-2 pointer-events-none flex flex-col items-center gap-2 transition-transform duration-300"
                    style={{ transform: isPlanningMode ? 'translateY(0)' : 'translateY(-100%)' }}
                >
                    <div className="bg-white/95 backdrop-blur shadow-lg p-3 rounded-xl border-2 border-blue-500 w-full max-w-2xl pointer-events-auto">
                        <div className="flex justify-between items-center mb-3 border-b pb-2">
                            <h2 className="font-bold text-blue-800">
                                <i className="fa-solid fa-map-location-dot mr-1"></i> 時間優先規劃模式
                            </h2>
                            <div className="flex gap-2">
                                <button onClick={openHistoryModal} className="text-blue-600 text-sm hover:text-blue-800 px-2">
                                    <i className="fa-solid fa-clock-rotate-left"></i> 歷史
                                </button>
                                <button onClick={() => toggleRouteMode(false)} className="text-gray-500 text-sm hover:text-red-500 px-2">
                                    退出
                                </button>
                            </div>
                        </div>

                        {/* Filter Section (Planner) */}
                        <div className="flex gap-2 items-center text-sm mb-3">
                            <select
                                value={cityFilterPlanner}
                                onChange={(e) => setCityFilterPlanner(e.target.value)}
                                className="border rounded px-2 py-1 bg-white text-gray-700 flex-1"
                            >
                                <option value="">全台灣</option>
                                {cities.map(c => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                            </select>
                            <label className="flex items-center gap-1 cursor-pointer select-none text-gray-600">
                                <input
                                    type="checkbox"
                                    checked={hideVisitedPlanner}
                                    onChange={(e) => setHideVisitedPlanner(e.target.checked)}
                                />
                                <span>隱藏已踩</span>
                            </label>
                            <button onClick={selectAllFiltered} className="text-blue-600 font-bold px-2 hover:bg-blue-50 rounded">
                                全選
                            </button>
                        </div>

                        <div className="space-y-2 mb-3">
                            <div className="flex gap-1 relative">
                                <div className="flex items-center justify-center w-8 text-green-600">
                                    <i className="fa-solid fa-play"></i>
                                </div>
                                <input
                                    value={startInputVal}
                                    onChange={(e) => handleStartInputChange(e.target.value)}
                                    type="text"
                                    placeholder="起點 (可手動輸入 Lat, Lng)"
                                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm outline-none"
                                />
                                <button
                                    onClick={() => useCurrentLocation('start')}
                                    className="text-gray-500 hover:text-blue-600 p-2"
                                    title="使用當前位置"
                                >
                                    <i className="fa-solid fa-crosshairs"></i>
                                </button>
                                <button
                                    onClick={() => setMapPickTarget('start')}
                                    className="text-gray-500 hover:text-blue-600 p-2"
                                    title="地圖選點"
                                >
                                    <i className="fa-solid fa-map-pin"></i>
                                </button>
                            </div>
                            <div className="flex gap-1 relative">
                                <div className="flex items-center justify-center w-8 text-red-600">
                                    <i className="fa-solid fa-flag-checkered"></i>
                                </div>
                                <input
                                    value={endInputVal}
                                    onChange={(e) => handleEndInputChange(e.target.value)}
                                    type="text"
                                    placeholder="終點 (預設同起點)"
                                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm outline-none"
                                />
                                <button
                                    onClick={() => setMapPickTarget('end')}
                                    className="text-gray-500 hover:text-blue-600 p-2"
                                    title="地圖選點"
                                >
                                    <i className="fa-solid fa-map-pin"></i>
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={calculateRoute}
                            disabled={loading}
                            className={`w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow transition-colors flex justify-center items-center gap-2 ${loading ? 'opacity-50' : ''}`}
                        >
                            <span>{loading ? "運算中..." : "計算最佳時間路線"}</span>
                            <span className="bg-white text-blue-600 text-xs px-1.5 py-0.5 rounded-full font-bold">
                                {selectedStationIds.size}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Map Pick Toast */}
                {mapPickTarget && (
                    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-black/75 text-white px-4 py-2 rounded-full text-sm font-bold z-[2000] pointer-events-none">
                        <i className="fa-solid fa-crosshairs mr-2"></i> 請點擊地圖選擇位置
                    </div>
                )}

                {/* Map */}
                <MapComponent
                    filteredStations={filteredStations}
                    selectedStationIds={selectedStationIds}
                    isPlanningMode={isPlanningMode}
                    isVisitedThisYear={isVisitedThisYear}
                    onMarkerClick={handleMarkerClick}
                    onMapClick={handleMapClick}
                    mapPickTarget={mapPickTarget}
                />

                {/* Detail Modal */}
                <div
                    className={`fixed bottom-0 left-0 right-0 z-[2000] transform transition-transform duration-300 ease-in-out ${detailModalOpen ? '' : 'translate-y-full'}`}
                >
                    <div className="bg-white rounded-t-2xl shadow-2xl p-5 md:max-w-2xl md:mx-auto border-t border-gray-200 pb-8">
                        <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>
                        <div className="flex justify-between items-start">
                            <h2 className="text-xl font-bold text-gray-900 mb-1">{currentStation.name}</h2>
                            <button onClick={() => setDetailModalOpen(false)} className="text-gray-400 p-1">
                                <i className="fa-solid fa-xmark fa-lg"></i>
                            </button>
                        </div>
                        <div className="space-y-3 mt-2 text-sm text-gray-600">
                            <div className="flex items-start gap-2">
                                <i className="fa-solid fa-location-dot mt-1 w-4 text-red-500"></i>
                                <span>{currentStation.address}</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fa-solid fa-calendar-check w-4 text-green-500"></i>
                                <span>{isVisitedThisYear(currentStation.id) ? "今年已踩點 ✅" : "尚未踩點"}</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fa-solid fa-clock w-4 text-blue-500"></i>
                                <span>{currentStation.hours || '無營業時間資訊'}</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <i className="fa-solid fa-circle-info w-4 text-gray-500"></i>
                                <span>{currentStation.Notes || '無備註'}</span>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <button
                                onClick={() => navigateTo(currentStation)}
                                className="bg-gray-100 py-3 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                            >
                                導航
                            </button>
                            <button
                                onClick={toggleCheckin}
                                className="bg-red-600 text-white py-3 rounded-xl font-medium hover:bg-red-700 transition-colors"
                            >
                                {isVisitedThisYear(currentStation.id) ? "取消打卡" : "踩點打卡"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Result Modal */}
                {resultModalOpen && (
                    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-end md:items-center justify-center">
                        <div className="bg-white w-full h-[80vh] md:h-auto md:max-h-[80vh] md:max-w-lg md:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl">
                            <div className="p-4 border-b flex justify-between items-center">
                                <h2 className="font-bold text-lg text-blue-700">
                                    <i className="fa-solid fa-clock mr-2"></i>時間優先排程結果
                                </h2>
                                <button onClick={() => setResultModalOpen(false)} className="text-gray-500">
                                    <i className="fa-solid fa-xmark fa-lg"></i>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                                <div className="relative pl-6 border-l-2 border-blue-200 space-y-6">
                                    <div className="font-bold text-green-600 mb-4 text-sm">起點: GPS 定位位置</div>
                                    {routeResult.map((s, i) => (
                                        <div key={i} className="relative pb-6 pl-6 border-l-2 border-blue-200">
                                            <div className="absolute -left-[11px] bg-blue-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                                                {i + 1}
                                            </div>
                                            <div className="font-bold text-gray-800">{s.name}</div>
                                            <div className="text-xs text-blue-500">預計行駛: {s.travelTime}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="p-4 border-t bg-white space-y-2">
                                {googleMapsLinks.map((link, i) => (
                                    <a
                                        key={i}
                                        href={link.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full bg-blue-600 text-white text-center font-bold py-3 rounded-xl shadow-lg mb-2 hover:bg-blue-700 transition"
                                    >
                                        {link.text}
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* History Modal */}
                {historyModalOpen && (
                    <div className="fixed inset-0 z-[3000] bg-black/50 flex items-end md:items-center justify-center">
                        <div className="bg-white w-full h-[80vh] md:h-auto md:max-h-[80vh] md:max-w-lg md:rounded-2xl rounded-t-2xl flex flex-col shadow-2xl">
                            <div className="p-4 border-b flex justify-between items-center">
                                <h2 className="font-bold text-lg text-gray-800">
                                    <i className="fa-solid fa-clock-rotate-left mr-2"></i>規劃歷史紀錄
                                </h2>
                                <button onClick={() => setHistoryModalOpen(false)} className="text-gray-500">
                                    <i className="fa-solid fa-xmark fa-lg"></i>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50 space-y-3">
                                {historyList.length === 0 ? (
                                    <div className="text-center text-gray-500 py-8">尚無歷史紀錄</div>
                                ) : (
                                    historyList.map((item, index) => (
                                        <div
                                            key={item.id}
                                            className="bg-white p-3 rounded-lg border shadow-sm flex justify-between items-center"
                                        >
                                            <div className="cursor-pointer flex-1" onClick={() => loadHistoryRoute(item)}>
                                                <div className="font-bold text-sm text-gray-800">{item.date}</div>
                                                <div className="text-xs text-gray-500">
                                                    起點: {item.start.lat.toFixed(3)}, {item.start.lng.toFixed(3)} | 站點數: {item.stations.length}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => deleteHistoryItem(index)}
                                                className="text-red-400 hover:text-red-600 p-2"
                                            >
                                                <i className="fa-solid fa-trash"></i>
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

// Map Component - needs to be separate for react-leaflet hooks
function MapComponent({ filteredStations, selectedStationIds, isPlanningMode, isVisitedThisYear, onMarkerClick, onMapClick, mapPickTarget }) {
    const [L, setL] = useState(null);
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        import('leaflet').then((leaflet) => {
            setL(leaflet.default);
        });
    }, []);

    if (!isClient || !L) {
        return <div id="map" style={{ height: '100vh', width: '100vw' }}></div>;
    }

    return (
        <MapContainerWrapper
            L={L}
            filteredStations={filteredStations}
            selectedStationIds={selectedStationIds}
            isPlanningMode={isPlanningMode}
            isVisitedThisYear={isVisitedThisYear}
            onMarkerClick={onMarkerClick}
            onMapClick={onMapClick}
            mapPickTarget={mapPickTarget}
        />
    );
}

function MapContainerWrapper({ L, filteredStations, selectedStationIds, isPlanningMode, isVisitedThisYear, onMarkerClick, onMapClick, mapPickTarget }) {
    const { MapContainer, TileLayer, Marker, useMapEvents } = require('react-leaflet');

    const createIcon = (visited, isSelected) => {
        let cssClass = 'pin';
        if (isSelected) cssClass += ' selected';
        else if (visited) cssClass += ' visited';

        return L.divIcon({
            className: 'custom-icon',
            html: `<div class="${cssClass}"></div>`,
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        });
    };

    function MapEvents() {
        useMapEvents({
            click: (e) => {
                if (mapPickTarget) {
                    onMapClick(e);
                }
            },
        });
        return null;
    }

    return (
        <MapContainer
            center={[23.6, 121.0]}
            zoom={7}
            zoomControl={false}
            style={{ height: '100vh', width: '100vw' }}
            className={mapPickTarget ? 'cursor-crosshair' : ''}
        >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
            <MapEvents />
            {filteredStations.map((station) => {
                const visited = isVisitedThisYear(station.id);
                const isSelected = selectedStationIds.has(station.id);
                return (
                    <Marker
                        key={station.id}
                        position={[station.lat, station.lng]}
                        icon={createIcon(visited, isSelected)}
                        eventHandlers={{
                            click: (e) => {
                                L.DomEvent.stopPropagation(e);
                                onMarkerClick(station);
                            },
                        }}
                    />
                );
            })}
        </MapContainer>
    );
}
