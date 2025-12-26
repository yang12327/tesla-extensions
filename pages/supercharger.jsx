import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { formatDateTime } from '../utils/datetime';
import MultiSelectDropdown from '../components/MultiSelectDropdown';

const APP_KEY = 'tesla_tracker_v3';
const HISTORY_KEY = 'tesla_map_history';
const GOOGLE_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; // 請填入您的 Google Maps API Key

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
    const [startLocationInfo, setStartLocationInfo] = useState(null);
    const [endLocationInfo, setEndLocationInfo] = useState(null);
    const [mapPickTarget, setMapPickTarget] = useState(null);
    const [tempPickedCoords, setTempPickedCoords] = useState(null);

    const [cityFilterNormal, setCityFilterNormal] = useState([]);
    const [hideVisitedNormal, setHideVisitedNormal] = useState(false);
    const [cityFilterPlanner, setCityFilterPlanner] = useState([]);
    const [hideVisitedPlanner, setHideVisitedPlanner] = useState(false);

    const [detailModalOpen, setDetailModalOpen] = useState(false);
    const [currentStation, setCurrentStation] = useState({});
    const [resultModalOpen, setResultModalOpen] = useState(false);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [routeResult, setRouteResult] = useState([]);
    const [finalTravelTime, setFinalTravelTime] = useState(0);
    const [historyList, setHistoryList] = useState([]);
    const [currentHistoryId, setCurrentHistoryId] = useState(null);
    const [loading, setLoading] = useState(false);

    const [startInputVal, setStartInputVal] = useState('');
    const [endInputVal, setEndInputVal] = useState('');
    const [flyToCoords, setFlyToCoords] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [toastMsg, setToastMsg] = useState('');

    const [startSuggestions, setStartSuggestions] = useState([]);
    const [endSuggestions, setEndSuggestions] = useState([]);
    const startSearchTimeoutRef = useRef(null);
    const endSearchTimeoutRef = useRef(null);

    const mapRef = useRef(null);

    // Load Google Maps Script
    useEffect(() => {
        if (!GOOGLE_API_KEY) return;
        if (window.google && window.google.maps) return;

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places`;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }, []);

    // Toast timer
    useEffect(() => {
        if (toastMsg) {
            const timer = setTimeout(() => setToastMsg(''), 5000);
            return () => clearTimeout(timer);
        }
    }, [toastMsg]);

    // Check API Key
    useEffect(() => {
        if (!GOOGLE_API_KEY) {
            setToastMsg("請於程式碼中設定 Google Maps API Key 以啟用完整功能 (自動完成、地址轉換)");
        }
    }, []);

    // Check if visited this year
    const isVisitedThisYear = useCallback((id) => {
        if (typeof window === 'undefined') return false;
        const v = JSON.parse(localStorage.getItem(APP_KEY) || '{}');
        const d = new Date(v[id])
        if (v[id] && d.getFullYear() === new Date().getFullYear())
            return d;
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
            "Taipei": "台北", "New Taipei": "新北", "Keelung": "基隆",
            "Yilan": "宜蘭", "Hualien": "花蓮", "Taitung": "台東",
            "Pingtung": "屏東", "Kaohsiung": "高雄", "Tainan": "台南",
            "Chiayi": "嘉義", "Yunlin": "雲林",
            "Nantou": "南投", "Changhua": "彰化", "Taichung": "台中",
            "Miaoli": "苗栗", "Hsinchu": "新竹", "Taoyuan": "桃園"
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
                label: `${displayName} （${visited} / ${total}）`,
                name: displayName
            };
        });
    }, [allStations, isVisitedThisYear]);

    // Filtered stations
    const filteredStations = useMemo(() => {
        const selectedCities = isPlanningMode ? cityFilterPlanner : cityFilterNormal;
        const hide = isPlanningMode ? hideVisitedPlanner : hideVisitedNormal;

        return allStations.filter(s => {
            if (selectedCities.length > 0 && !selectedCities.includes(s.city)) return false;
            if (hide && isVisitedThisYear(s.id)) return false;
            return true;
        });
    }, [allStations, isPlanningMode, cityFilterNormal, cityFilterPlanner, hideVisitedNormal, hideVisitedPlanner, isVisitedThisYear]);

    // Google Maps links
    const googleMapsLinks = useMemo(() => {
        if (!routeResult.length) return [];
        const allPoints = [routeStartCoords, ...routeResult].filter(p => p);
        if (routeEndCoords) {
            allPoints.push(routeEndCoords);
        }
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
    }, [routeResult, routeStartCoords, routeEndCoords]);

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

        // Watch user location
        if (navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                (err) => {
                    console.error("Location watch error:", err);
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
            return () => navigator.geolocation.clearWatch(watchId);
        }
    }, []);

    // Update input values when coords change
    useEffect(() => {
        if (routeStartCoords) {
            if (startLocationInfo && startLocationInfo.address && 
                Math.abs(startLocationInfo.lat - routeStartCoords.lat) < 0.00001 && 
                Math.abs(startLocationInfo.lng - routeStartCoords.lng) < 0.00001) {
                setStartInputVal(startLocationInfo.address);
            } else {
                setStartInputVal(`${routeStartCoords.lat.toFixed(5)}, ${routeStartCoords.lng.toFixed(5)}`);
            }
        } else {
            setStartInputVal('');
        }
    }, [routeStartCoords, startLocationInfo]);

    useEffect(() => {
        if (routeEndCoords) {
            if (endLocationInfo && endLocationInfo.address && 
                Math.abs(endLocationInfo.lat - routeEndCoords.lat) < 0.00001 && 
                Math.abs(endLocationInfo.lng - routeEndCoords.lng) < 0.00001) {
                setEndInputVal(endLocationInfo.address);
            } else {
                setEndInputVal(`${routeEndCoords.lat.toFixed(5)}, ${routeEndCoords.lng.toFixed(5)}`);
            }
        } else {
            setEndInputVal('');
        }
    }, [routeEndCoords, endLocationInfo]);

    // Fetch suggestions
    const fetchSuggestions = async (query, setSuggestions) => {
        if (!query || query.length < 2) {
            setSuggestions([]);
            return;
        }

        if (window.google && window.google.maps) {
            const service = new window.google.maps.places.AutocompleteService();
            service.getPlacePredictions({ input: query, componentRestrictions: { country: 'tw' } }, (predictions, status) => {
                if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
                    setSuggestions(predictions);
                } else {
                    setSuggestions([]);
                }
            });
            return;
        }

        // Fallback to Nominatim if Google API is not loaded
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`, {
                headers: { 'Accept-Language': 'zh-TW' }
            });
            if (res.ok) {
                const data = await res.json();
                setSuggestions(data);
            }
        } catch (e) {
            console.error("Suggestion fetch failed", e);
        }
    };

    // Handle start input change
    const handleStartInputChange = (val) => {
        setStartInputVal(val);
        if (startSearchTimeoutRef.current) clearTimeout(startSearchTimeoutRef.current);
        startSearchTimeoutRef.current = setTimeout(() => {
            fetchSuggestions(val, setStartSuggestions);
        }, 500);
    };

    // Handle end input change
    const handleEndInputChange = (val) => {
        setEndInputVal(val);
        if (endSearchTimeoutRef.current) clearTimeout(endSearchTimeoutRef.current);
        endSearchTimeoutRef.current = setTimeout(() => {
            fetchSuggestions(val, setEndSuggestions);
        }, 500);
    };

    // Select suggestion
    const selectSuggestion = (item, type) => {
        if (item.place_id && window.google && window.google.maps) {
            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ placeId: item.place_id }, (results, status) => {
                if (status === 'OK' && results[0]) {
                    const location = results[0].geometry.location;
                    const lat = location.lat();
                    const lng = location.lng();
                    if (type === 'start') {
                        setRouteStartCoords({ lat, lng });
                        setStartSuggestions([]);
                    } else {
                        setRouteEndCoords({ lat, lng });
                        setEndSuggestions([]);
                    }
                }
            });
            return;
        }

        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        if (type === 'start') {
            setRouteStartCoords({ lat, lng });
            setStartSuggestions([]);
        } else {
            setRouteEndCoords({ lat, lng });
            setEndSuggestions([]);
        }
    };

    // Toggle route mode
    const toggleRouteMode = (val) => {
        setIsPlanningMode(val);
        if (val) {
            setDetailModalOpen(false);
        } else {
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



    // Get address from coords
    const getAddress = async (lat, lng) => {
        if (window.google && window.google.maps) {
            return new Promise((resolve) => {
                const geocoder = new window.google.maps.Geocoder();
                geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        resolve(results[0].formatted_address);
                    } else {
                        resolve("地址查詢失敗");
                    }
                });
            });
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超時

            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                signal: controller.signal,
                headers: {
                    'Accept-Language': 'zh-TW'
                }
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error('Network response was not ok');

            const data = await res.json();
            return data.display_name || "未知地址";
        } catch (e) {
            console.error("Address fetch failed:", e);
            return "地址查詢失敗";
        }
    };

    // Get coords from address/keyword
    const getCoordsFromAddress = async (query) => {
        if (window.google && window.google.maps) {
            return new Promise((resolve) => {
                const geocoder = new window.google.maps.Geocoder();
                geocoder.geocode({ address: query }, (results, status) => {
                    if (status === 'OK' && results[0]) {
                        const loc = results[0].geometry.location;
                        resolve({ lat: loc.lat(), lng: loc.lng() });
                    } else {
                        resolve(null);
                    }
                });
            });
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
                signal: controller.signal,
                headers: {
                    'Accept-Language': 'zh-TW'
                }
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error('Network response was not ok');

            const data = await res.json();
            if (data && data.length > 0) {
                return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
            }
            return null;
        } catch (e) {
            console.error("Geocoding failed:", e);
            return null;
        }
    };

    // Calculate route
    const calculateRoute = async () => {
        setLoading(true);
        try {
            const parseCoords = (val) => {
                if (!val) return null;
                const parts = val.split(',').map(p => parseFloat(p.trim()));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    return { lat: parts[0], lng: parts[1] };
                }
                return null;
            };

            let startCoords = parseCoords(startInputVal);
            if (startInputVal && !startCoords) {
                const result = await getCoordsFromAddress(startInputVal);
                if (result) {
                    startCoords = result;
                } else {
                    throw new Error("無法找到起點位置，請確認輸入的地址或座標是否正確");
                }
            }
            if (startCoords) {
                setRouteStartCoords(startCoords);
            }

            // 1. Handle Start
            if (!startCoords) {
                if (!navigator.geolocation) {
                    setToastMsg("瀏覽器不支援定位，請手動輸入起點");
                    setLoading(false);
                    return;
                }
                try {
                    const pos = await new Promise((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: false, // 降低精度要求以加快速度
                            timeout: 10000, // 10秒超時
                            maximumAge: 60000 // 可接受1分鐘內的快取
                        });
                    });
                    startCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    setRouteStartCoords(startCoords);
                } catch (err) {
                    console.error(err);
                    setToastMsg("無法獲取定位，請確認已允許定位權限或手動輸入起點");
                    setLoading(false);
                    return;
                }
            }

            // 2. Handle End
            let endCoords = parseCoords(endInputVal);
            if (endInputVal && !endCoords) {
                const result = await getCoordsFromAddress(endInputVal);
                if (result) {
                    endCoords = result;
                } else {
                    throw new Error("無法找到終點位置，請確認輸入的地址或座標是否正確");
                }
            }
            if (endCoords) {
                setRouteEndCoords(endCoords);
            }

            if (!endCoords) {
                endCoords = startCoords;
                setRouteEndCoords(endCoords);
            }

            if (selectedStationIds.size === 0) {
                throw new Error("請選擇至少一個站點");
            }

            // 3. Get Addresses (Parallel execution to save time)
            const [startAddr, endAddr] = await Promise.all([
                getAddress(startCoords.lat, startCoords.lng),
                getAddress(endCoords.lat, endCoords.lng)
            ]);

            setStartLocationInfo({ ...startCoords, address: startAddr });
            setEndLocationInfo({ ...endCoords, address: endAddr });

            const startInfo = { ...startCoords, address: startAddr };
            const endInfo = { ...endCoords, address: endAddr };

            let currentStationIdx = -1;
            let minDst = Infinity;
            allStations.forEach((s, i) => {
                const d = (s.lat - startCoords.lat) ** 2 + (s.lng - startCoords.lng) ** 2;
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
                routeOrder.push({ ...nextNode, travelTime: Math.round(minTime) });

                currentStationIdx = allStations.indexOf(nextNode);
                nodes.splice(bestNodeIdx, 1);
            }

            // Calculate final leg time
            const finalTime = calculateFinalLegTime(routeOrder, endCoords);
            setFinalTravelTime(finalTime);

            const totalTime = calculateTotalTime(routeOrder, endCoords);
            const newId = saveRouteToHistory(routeOrder, startInfo, endInfo, totalTime);
            setCurrentHistoryId(newId);
            setRouteResult(routeOrder);
            setResultModalOpen(true);
        } catch (err) {
            setToastMsg("運算失敗：" + err.message);
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
        var R = 6371; // Radius of the earth in km
        var dLat = deg2rad(lat2 - lat1);
        var dLon = deg2rad(lon2 - lon1);
        var a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2)
            ;
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        var d = R * c; // Distance in km
        return d;
    }

    function deg2rad(deg) {
        return deg * (Math.PI / 180)
    }

    // Helper to calculate final leg time
    const calculateFinalLegTime = (stations, endLocation) => {
        if (!stations || stations.length === 0 || !endLocation) return 0;
        const lastStation = stations[stations.length - 1];
        if (!lastStation.lat || !lastStation.lng || !endLocation.lat || !endLocation.lng) return 0;
        
        const dist = getDistanceFromLatLonInKm(lastStation.lat, lastStation.lng, endLocation.lat, endLocation.lng);
        return Math.round((dist / 50) * 60); // 50km/h
    };

    // Helper to calculate total trip time
    const calculateTotalTime = (stations, endLocation) => {
        if (!stations) return 0;
        const stationsTime = stations.reduce((acc, s) => acc + (s.travelTime || 0), 0);
        const finalLegTime = calculateFinalLegTime(stations, endLocation);
        return stationsTime + finalLegTime;
    };

    // Save route to history
    const saveRouteToHistory = (routeOrder, startInfo, endInfo, totalTime) => {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const dateStr = new Date().toLocaleString();
        const newItem = {
            id: Date.now(),
            title: dateStr,
            date: dateStr,
            start: startInfo,
            end: endInfo,
            stations: routeOrder,
            totalTime: totalTime
        };
        history.unshift(newItem);
        if (history.length > 20) history.pop();
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        return newItem.id;
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

    // Update history title
    const updateHistoryTitle = (id, newTitle) => {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const index = history.findIndex(item => item.id === id);
        if (index !== -1) {
            history[index].title = newTitle;
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
            setHistoryList(history);
        }
    };

    // Edit route
    const editRoute = () => {
        setIsPlanningMode(true);
        
        const newSelected = new Set();
        routeResult.forEach(s => {
            if (s.id) newSelected.add(s.id);
        });
        setSelectedStationIds(newSelected);
        
        setResultModalOpen(false);
    };

    // Load history route
    const loadHistoryRoute = (item) => {
        if (item.start) {
            setRouteStartCoords(item.start);
            setStartLocationInfo(item.start);
        } else {
            setRouteStartCoords(null);
            setStartLocationInfo(null);
        }

        if (item.end) {
            setRouteEndCoords(item.end);
            setEndLocationInfo(item.end);
        } else {
            setRouteEndCoords(item.start || null);
            setEndLocationInfo(item.start || null);
        }

        // Calculate final leg time dynamically
        const finalTime = calculateFinalLegTime(item.stations, item.end);
        setFinalTravelTime(finalTime);

        setCurrentHistoryId(item.id);
        setRouteResult(item.stations || []);
        setResultModalOpen(true);
        setHistoryModalOpen(false);
    };

    // Handle GPS click
    const handleGPSClick = () => {
        if (userLocation) {
            setFlyToCoords({ ...userLocation, ts: Date.now() });
            return;
        }

        if (!navigator.geolocation) {
            setToastMsg("瀏覽器不支援定位");
            return;
        }
        navigator.geolocation.getCurrentPosition((pos) => {
            const latlng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setFlyToCoords({ ...latlng, ts: Date.now() });
        }, (err) => {
            setToastMsg("無法取得定位: " + err.message);
        });
    };

    // Handle map click
    const handleMapClick = (e) => {
        if (mapPickTarget) {
            const latlng = { lat: e.latlng.lat, lng: e.latlng.lng };
            setTempPickedCoords(latlng);
        } else {
            setDetailModalOpen(false);
        }
    };

    // Confirm map pick
    const confirmMapPick = () => {
        if (mapPickTarget && tempPickedCoords) {
            if (mapPickTarget === 'start') {
                setRouteStartCoords(tempPickedCoords);
            } else {
                setRouteEndCoords(tempPickedCoords);
            }
            setMapPickTarget(null);
            setTempPickedCoords(null);
        }
    };

    // Cancel map pick
    const cancelMapPick = () => {
        setMapPickTarget(null);
        setTempPickedCoords(null);
    };

    // Handle marker click
    const handleMarkerClick = (station) => {
        if (isPlanningMode) {
            toggleStationSelection(station.id);
            openDetailModal(station);
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
                transform-origin: 0% 100%;
                left: 50%; top: 100%; margin-top: -30px;
                box-shadow: 0 3px 5px rgba(0,0,0,0.3); border: 2px solid white;
                transition: all 0.2s ease;
                }
                .pin::after {
                content: ''; width: 14px; height: 14px; margin: 6px 0 0 6px;
                background: #fff; position: absolute; border-radius: 50%;
                }
                .pin.visited { background: #cc0000; z-index: 10; }
                .pin.selected { background: #2563eb !important; transform: scale(1.2) rotate(-45deg); z-index: 20; border-color: #fbbf24; }
                .pin.current { transform: scale(1.3) rotate(-45deg); z-index: 30; box-shadow: 0 0 10px 4px rgba(128, 128, 128, 0.6); }
                .pin .warning-icon {
                    position: absolute;
                    right: -8px; top: 4px;
                    width: 16px; height: 16px;
                    border-radius: 50%;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    transform: rotate(45deg);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
                }
                .pin .warning-icon i {
                    color: #f59e0b;
                    font-size: 16px;
                }
                .cursor-crosshair, .cursor-crosshair .leaflet-interactive, .cursor-crosshair .leaflet-grab { cursor: crosshair !important; }
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
                                    今年進度：<span className="font-bold text-red-600">{visitedStats.count}</span> / <span>{visitedStats.total}</span>
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
                            <div className="flex-1 min-w-0">
                                <MultiSelectDropdown
                                    options={cities}
                                    selectedValues={cityFilterNormal}
                                    onChange={setCityFilterNormal}
                                    placeholder="所有縣市"
                                />
                            </div>
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
                                <i className="fa-solid fa-map-location-dot mr-1"></i> 路線規劃
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
                            <div className="flex-1 min-w-0">
                                <MultiSelectDropdown
                                    options={cities}
                                    selectedValues={cityFilterPlanner}
                                    onChange={setCityFilterPlanner}
                                    placeholder="全部縣市"
                                />
                            </div>
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
                                    onBlur={() => setTimeout(() => setStartSuggestions([]), 200)}
                                    type="text"
                                    placeholder="起點 （預設目前位置）"
                                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm outline-none"
                                />
                                {startSuggestions.length > 0 && (
                                    <ul className="absolute top-full left-8 right-10 bg-white border border-gray-200 rounded-b-lg shadow-lg z-[2000] max-h-60 overflow-y-auto">
                                        {startSuggestions.map((item, idx) => (
                                            <li
                                                key={idx}
                                                onClick={() => selectSuggestion(item, 'start')}
                                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0 text-gray-700 text-left"
                                            >
                                                <div className="font-bold truncate">{item.description || item.display_name.split(',')[0]}</div>
                                                <div className="text-xs text-gray-500 truncate">{item.description || item.display_name}</div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <button
                                    onClick={() => { setRouteStartCoords(null); setStartInputVal(''); }}
                                    className="text-gray-500 hover:text-blue-600 p-2"
                                    title="使用目前位置"
                                >
                                    <i className="fa-solid fa-crosshairs"></i>
                                </button>
                                <button
                                    onClick={() => setMapPickTarget('start')}
                                    className={`p-2 transition-colors ${mapPickTarget === 'start' ? 'text-blue-400' : 'text-gray-500 hover:text-blue-600'}`}
                                    title="選擇地圖座標"
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
                                    onBlur={() => setTimeout(() => setEndSuggestions([]), 200)}
                                    type="text"
                                    placeholder="終點 （預設回到起點）"
                                    className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm outline-none"
                                />
                                {endSuggestions.length > 0 && (
                                    <ul className="absolute top-full left-8 right-10 bg-white border border-gray-200 rounded-b-lg shadow-lg z-[2000] max-h-60 overflow-y-auto">
                                        {endSuggestions.map((item, idx) => (
                                            <li
                                                key={idx}
                                                onClick={() => selectSuggestion(item, 'end')}
                                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0 text-gray-700 text-left"
                                            >
                                                <div className="font-bold truncate">{item.description || item.display_name.split(',')[0]}</div>
                                                <div className="text-xs text-gray-500 truncate">{item.description || item.display_name}</div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <button
                                    onClick={() => { setRouteEndCoords(null); setEndInputVal(''); }}
                                    className="text-gray-500 hover:text-blue-600 p-2"
                                    title="回到起點"
                                >
                                    <i className="fa-solid fa-rotate-left"></i>
                                </button>
                                <button
                                    onClick={() => setMapPickTarget('end')}
                                    className={`p-2 transition-colors ${mapPickTarget === 'end' ? 'text-blue-400' : 'text-gray-500 hover:text-blue-600'}`}
                                    title="選擇地圖座標"
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
                            <span>{loading ? "執行中..." : "開始規畫"}</span>
                            <span className="bg-white text-blue-600 text-xs px-1.5 py-0.5 rounded-full font-bold">
                                {selectedStationIds.size}
                            </span>
                        </button>
                    </div>
                </div>

                {/* Map Pick Toast */}
                {mapPickTarget && !tempPickedCoords && (
                    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-black/75 text-white px-4 py-2 rounded-full text-sm font-bold z-[2000] pointer-events-none">
                        <i className="fa-solid fa-crosshairs mr-2"></i> 請點擊地圖選擇位置
                    </div>
                )}

                {/* Map Pick Confirmation Modal */}
                {mapPickTarget && tempPickedCoords && (
                    <div className="fixed bottom-0 left-0 right-0 z-[2500] p-4 flex justify-center pointer-events-none">
                        <div className="bg-white rounded-2xl shadow-2xl p-5 w-full max-w-md border border-gray-200 pointer-events-auto animate-slide-up">
                            <div className="text-center mb-4">
                                <h3 className="font-bold text-lg text-gray-800 mb-1">確認座標位置</h3>
                                <p className="text-gray-600 font-mono text-lg">
                                    {tempPickedCoords.lat.toFixed(5)}, {tempPickedCoords.lng.toFixed(5)}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">您可以繼續點擊地圖以修正位置</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={cancelMapPick}
                                    className="bg-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    onClick={confirmMapPick}
                                    className="bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors"
                                >
                                    確認選擇
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* General Toast */}
                {toastMsg && (
                    <div className="fixed top-32 left-1/2 transform -translate-x-1/2 bg-black/75 text-white px-4 py-2 rounded-full text-sm font-bold z-[2000] pointer-events-none transition-opacity duration-300">
                        <i className="fa-solid fa-circle-exclamation mr-2"></i> {toastMsg}
                    </div>
                )}

                {/* GPS Button */}
                <button
                    onClick={handleGPSClick}
                    className="fixed bottom-24 right-4 z-[1500] bg-white text-gray-700 p-3 rounded-full shadow-lg hover:bg-gray-100 transition-colors flex items-center justify-center w-12 h-12"
                    title="定位到目前位置"
                >
                    <i className="fa-solid fa-location-crosshairs fa-lg"></i>
                </button>

                {/* Map */}
                <MapComponent
                    filteredStations={filteredStations}
                    selectedStationIds={selectedStationIds}
                    isPlanningMode={isPlanningMode}
                    isVisitedThisYear={isVisitedThisYear}
                    onMarkerClick={handleMarkerClick}
                    onMapClick={handleMapClick}
                    mapPickTarget={mapPickTarget}
                    tempPickedCoords={tempPickedCoords}
                    flyToCoords={flyToCoords}
                    userLocation={userLocation}
                    currentStation={detailModalOpen ? currentStation : null}
                />

                {/* Detail Modal */}
                <div
                    className={`fixed bottom-0 left-0 right-0 z-[2000] transform transition-transform duration-300 ease-in-out ${detailModalOpen ? '' : 'translate-y-full'} pointer-events-none`}
                >
                    <div className="bg-white rounded-t-2xl shadow-2xl p-5 md:max-w-2xl md:mx-auto border-t border-gray-200 pb-8 pointer-events-auto">
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
                                {(() => {
                                    let d = isVisitedThisYear(currentStation.id)
                                    return d ? (
                                        <>
                                            <i className="fa-solid fa-calendar-check w-4 text-green-500"></i>
                                            <span>今年已踩點 （{formatDateTime(d, '{M}/{D}')}）</span>
                                        </>
                                    ) : (
                                        <>
                                            <i className="fa-solid fa-calendar-check w-4"></i>
                                            <span>尚未踩點</span>
                                        </>
                                    )
                                })()}
                            </div>
                            {currentStation.hours && (
                                <div className="flex items-start gap-2">
                                    <i className="fa-solid fa-clock w-4 text-blue-500"></i>
                                    <span>{currentStation.hours || '無營業時間資訊'}</span>
                                </div>
                            )}
                            {currentStation.Notes && (
                                <div className="flex items-start gap-2">
                                    <i className="fa-solid fa-circle-info w-4 text-gray-500"></i>
                                    <span>{currentStation.Notes || '無備註'}</span>
                                </div>
                            )}
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
                                className={`${isVisitedThisYear(currentStation.id) ? "bg-black hover:bg-gray-800" : "bg-red-600 hover:bg-red-700"} text-white py-3 rounded-xl font-medium transition-colors`}
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
                                <div className="flex-1 mr-4">
                                    <input 
                                        type="text" 
                                        className="w-full border rounded px-2 py-1 text-base font-bold text-blue-700 focus:outline-none focus:border-blue-500"
                                        defaultValue={(() => {
                                            if (typeof window === 'undefined' || !currentHistoryId) return new Date().toLocaleString();
                                            const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
                                            const item = history.find(h => h.id === currentHistoryId);
                                            return item ? (item.title || item.date) : new Date().toLocaleString();
                                        })()}
                                        onBlur={(e) => currentHistoryId && updateHistoryTitle(currentHistoryId, e.target.value)}
                                    />
                                    <div className="text-xs text-blue-600 mt-1">
                                        總行程時間：{(() => {
                                            const totalMinutes = calculateTotalTime(routeResult, endLocationInfo);
                                            const h = Math.floor(totalMinutes / 60);
                                            const m = totalMinutes % 60;
                                            let str = '';
                                            if (h > 0) str += ` ${h} 小時`;
                                            if (m > 0) str += ` ${m} 分鐘`;
                                            return str || '0 分鐘';
                                        })()}
                                    </div>
                                </div>
                                <button onClick={() => setResultModalOpen(false)} className="text-gray-500">
                                    <i className="fa-solid fa-xmark fa-lg"></i>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                                <div className="relative pl-6 border-blue-200">
                                    <div className="relative pl-6 border-l-2 border-blue-200">
                                        <div className="absolute -left-[11px] bg-green-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                                            起
                                        </div>
                                        <div className="font-bold text-gray-800">
                                            {startLocationInfo?.address || "未知地址"}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {startLocationInfo?.lat?.toFixed(5)}, {startLocationInfo?.lng?.toFixed(5)}
                                        </div>
                                    </div>
                                    {routeResult.map((s, i) => {
                                        let timeDisplay = '';
                                        if (typeof s.travelTime === 'number') {
                                            const h = Math.floor(s.travelTime / 60);
                                            const m = s.travelTime % 60;
                                            if (h > 0)
                                                timeDisplay = ` ${h} 小時`;
                                            if (m > 0)
                                                timeDisplay += ` ${m} 分鐘`;
                                        }
                                        return (
                                            <div key={i} className="relative pl-6 border-l-2 border-blue-200">
                                                <div className="text-xs text-blue-500 py-3">預計行駛：{timeDisplay}</div>
                                                <div className="absolute -left-[11px] bg-blue-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                                                    {i + 1}
                                                </div>
                                                <div className="font-bold text-gray-800">{s.name}</div>
                                            </div>
                                        );
                                    })}
                                    <div className="relative pl-6 border-l-2 border-blue-200">
                                        <div className="text-xs text-blue-500 py-3">
                                            預計行駛：{(() => {
                                                const h = Math.floor(finalTravelTime / 60);
                                                const m = finalTravelTime % 60;
                                                let str = '';
                                                if (h > 0) str += ` ${h} 小時`;
                                                if (m > 0) str += ` ${m} 分鐘`;
                                                return str || '0 分鐘';
                                            })()}
                                        </div>
                                        <div className="absolute -left-[11px] bottom-0 bg-red-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                                            終
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {endLocationInfo?.lat.toFixed(5)}, {endLocationInfo?.lng.toFixed(5)}
                                        </div>
                                        <div className="font-bold text-gray-800">
                                            {endLocationInfo?.address || "未知地址"}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t bg-white space-y-2">
                                <button
                                    onClick={editRoute}
                                    className="block w-full bg-gray-600 text-white text-center font-bold py-3 rounded-xl shadow-lg mb-2 hover:bg-gray-700 transition"
                                >
                                    <i className="fa-solid fa-pen-to-square mr-2"></i>
                                    編輯行程
                                </button>
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
                                                <div className="font-bold text-sm text-gray-800 mb-1">{item.title || item.date}</div>
                                                <div className="text-xs text-gray-600 mb-1">
                                                    <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded mr-2">
                                                        {item.stations ? item.stations.length : 0} 站
                                                    </span>
                                                    <span className="text-gray-500">
                                                        {(() => {
                                                            const totalTime = calculateTotalTime(item.stations, item.end);
                                                            if (!totalTime) return '未計算時間';
                                                            const h = Math.floor(totalTime / 60);
                                                            const m = totalTime % 60;
                                                            let str = '';
                                                            if (h > 0) str += ` ${h} 小時`;
                                                            if (m > 0) str += ` ${m} 分鐘`;
                                                            return str || '0 分鐘';
                                                        })()}
                                                    </span>
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    <i className="fa-solid fa-location-dot text-green-600 mr-1"></i>
                                                    {item.start?.address || (item.start ? `${item.start.lat.toFixed(3)}, ${item.start.lng.toFixed(3)}` : '未知')}
                                                </div>
                                                <div className="text-xs text-gray-500 truncate">
                                                    <i className="fa-solid fa-location-dot text-red-600 mr-1"></i>
                                                    {item.end?.address || (item.end ? `${item.end.lat.toFixed(3)}, ${item.end.lng.toFixed(3)}` : '未知')}
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
function MapComponent({ filteredStations, selectedStationIds, isPlanningMode, isVisitedThisYear, onMarkerClick, onMapClick, mapPickTarget, tempPickedCoords, flyToCoords, userLocation, currentStation }) {
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
            tempPickedCoords={tempPickedCoords}
            flyToCoords={flyToCoords}
            userLocation={userLocation}
            currentStation={currentStation}
        />
    );
}

function MapEvents({ mapPickTarget, onMapClick }) {
    const { useMap, useMapEvents } = require('react-leaflet');
    const map = useMap();

    useEffect(() => {
        const container = map.getContainer();
        if (mapPickTarget) {
            container.classList.remove('leaflet-grab');
            container.classList.add('cursor-crosshair');
        } else {
            container.classList.remove('cursor-crosshair');
            if (map.dragging.enabled()) {
                container.classList.add('leaflet-grab');
            }
        }
    }, [mapPickTarget, map]);

    useMapEvents({
        click: (e) => {
            onMapClick(e);
        },
    });
    return null;
}

function FlyToHandler({ coords }) {
    const { useMap } = require('react-leaflet');
    const map = useMap();
    useEffect(() => {
        if (coords) {
            map.flyTo([coords.lat, coords.lng], 13, {
                animate: true,
                duration: 1.5
            });
        }
    }, [coords, map]);
    return null;
}

function MapContainerWrapper({ L, filteredStations, selectedStationIds, isPlanningMode, isVisitedThisYear, onMarkerClick, onMapClick, mapPickTarget, tempPickedCoords, flyToCoords, userLocation, currentStation }) {
    const { MapContainer, TileLayer, Marker } = require('react-leaflet');

    const createIcon = (visited, isSelected, isCurrent, hasHours) => {
        let cssClass = 'pin';
        if (isSelected) cssClass += ' selected';
        else if (visited) cssClass += ' visited';

        if (isCurrent) cssClass += ' current';
        
        let innerHtml = '';
        if (hasHours) {
            cssClass += ' has-hours';
            innerHtml = '<div class="warning-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>';
        }

        return L.divIcon({
            className: 'custom-icon',
            html: `<div class="${cssClass}">${innerHtml}</div>`,
            iconSize: [30, 42],
            iconAnchor: [15, 42]
        });
    };

    const userIcon = L.divIcon({
        className: 'custom-icon',
        html: `<div style="width: 16px; height: 16px; background-color: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 0 0 2px #3b82f6;"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    });

    const tempIcon = L.divIcon({
        className: 'custom-icon',
        html: `<div style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: flex-end; color: #ef4444; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3));"><i class="fa-solid fa-map-pin" style="font-size: 32px; line-height: 1;"></i></div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });

    return (
        <MapContainer
            center={[23.6, 121.0]}
            zoom={7}
            zoomControl={false}
            style={{ height: '100vh', width: '100vw' }}
        >
            <TileLayer
                url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                attribution='&copy; Google Maps'
            />
            <MapEvents mapPickTarget={mapPickTarget} onMapClick={onMapClick} />
            <FlyToHandler coords={flyToCoords} />
            {userLocation && (
                <Marker
                    position={[userLocation.lat, userLocation.lng]}
                    icon={userIcon}
                    zIndexOffset={1000}
                />
            )}
            {tempPickedCoords && (
                <Marker
                    position={[tempPickedCoords.lat, tempPickedCoords.lng]}
                    icon={tempIcon}
                    zIndexOffset={2000}
                />
            )}
            {filteredStations.map((station) => {
                const visited = isVisitedThisYear(station.id);
                const isSelected = selectedStationIds.has(station.id);
                const isCurrent = currentStation && currentStation.id === station.id;
                const hasHours = !!station.hours;
                return (
                    <Marker
                        key={station.id}
                        position={[station.lat, station.lng]}
                        icon={createIcon(visited, isSelected, isCurrent, hasHours)}
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
