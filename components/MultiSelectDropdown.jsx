import { useState, useEffect, useRef } from 'react';

export default function MultiSelectDropdown({ options, selectedValues, onChange, placeholder = "請選擇" }) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownRef]);

    const handleOptionClick = (value) => {
        const newSelectedValues = selectedValues.includes(value)
            ? selectedValues.filter(v => v !== value)
            : [...selectedValues, value];
        onChange(newSelectedValues);
    };

    const handleSelectAll = () => {
        onChange(options.map(o => o.value));
    };

    const handleClear = () => {
        onChange([]);
    };

    const selectedLabels = options
        .filter(o => selectedValues.includes(o.value))
        .map(o => o.name || o.label);

    const displayText = selectedLabels?.join('、');

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="border rounded px-2 py-1 bg-white text-gray-700 w-full text-left flex justify-between items-center min-w-[120px]"
            >
                <div className="flex-1 min-w-0 mr-2">
                    <div className="truncate" title={displayText}>{displayText || placeholder}</div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {selectedValues.length > 0 && (
                        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                            {selectedValues.length}
                        </span>
                    )}
                    <i className={`fa-solid fa-chevron-down text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
                </div>
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg z-[3000] max-h-80 flex flex-col">
                    <div className="p-2 border-b border-gray-100 flex justify-between gap-2">
                        <button
                            onClick={handleSelectAll}
                            className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100 flex-1"
                        >
                            全選
                        </button>
                        <button
                            onClick={handleClear}
                            className="text-xs bg-gray-50 text-gray-600 px-2 py-1 rounded hover:bg-gray-100 flex-1"
                        >
                            清除
                        </button>
                    </div>
                    <div className="overflow-y-auto flex-1 p-1">
                        {options.map(option => (
                            <label
                                key={option.value}
                                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 cursor-pointer rounded"
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedValues.includes(option.value)}
                                    onChange={() => handleOptionClick(option.value)}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
