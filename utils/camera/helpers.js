import { REASON_MAPPING, DEFAULT_CLIP_DURATION } from './constants';
import { formatDateTime as fmtDT } from '../datetime';

export const formatDuration = (seconds) => {
  if (!seconds && seconds !== 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const parseTeslaTimestamp = (dateStr, timeStr) => {
  return new Date(`${dateStr}T${timeStr.replace(/-/g, ':')}`);
};

export const getReasonLabel = (reasonStr) => {
  if (!reasonStr) return "Sentry Mode";
  const match = REASON_MAPPING.find(([key]) => reasonStr.startsWith(key));
  return match ? match[1] : reasonStr;
};

export const getVideoDuration = (file) => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      resolve(DEFAULT_CLIP_DURATION);
    };
    video.src = window.URL.createObjectURL(file);
  });
};

export const formatDateTime = (date) => fmtDT(date, '{Y}/{M}/{D} {H}:{m}');

export const formatFullTimestamp = (dateString) => fmtDT(dateString);

export const formatEventTimeRange = (startDate, endDate) => {
  const startStr = formatDateTime(startDate);
  const endStr = formatDateTime(endDate);

  const startTicks = new Date(startDate).setHours(0, 0, 0, 0);
  const endTicks = new Date(endDate).setHours(0, 0, 0, 0);
  const isSameDay = startTicks === endTicks;

  if (isSameDay) {
    const datePart = startStr.substring(0, startStr.lastIndexOf(' '));
    const startHourMin = startStr.substring(startStr.lastIndexOf(' ') + 1);
    const endHourMin = endStr.substring(endStr.lastIndexOf(' ') + 1);
    return `${datePart} ${startHourMin}~${endHourMin}`;
  } else {
    return `${startStr}~${endStr}`;
  }
};
