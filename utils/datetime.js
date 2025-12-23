export const formatDateTime = (date, format = '{Y}/{M}/{D} {h}:{m}:{s}') => {
    if (!date) return date;
    if (!(date instanceof Date))
        date = new Date(date);
    const Y = date.getFullYear();
    const M = date.getMonth() + 1;
    const D = date.getDate();
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');
    return format
        .replace('{Y}', Y)
        .replace('{M}', M)
        .replace('{D}', D)
        .replace('{h}', h)
        .replace('{m}', m)
        .replace('{s}', s);
}