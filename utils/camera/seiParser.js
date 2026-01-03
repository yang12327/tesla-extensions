/**
 * Tesla Dashcam SEI Metadata Parser
 * 從 Tesla 行車記錄器影片中解析 SEI 元數據
 * 
 * SEI (Supplemental Enhancement Information) 包含車輛狀態資訊：
 * - 車速、方向盤角度、油門位置
 * - 煞車狀態、方向燈、檔位
 * - 輔助駕駛狀態、GPS 座標、加速度
 */

// SEI 元數據欄位定義
export const SEI_FIELDS = {
  version: { label: '版本', unit: '' },
  gearState: { label: '檔位', unit: '', enum: { 0: 'P', 1: 'D', 2: 'R', 3: 'N' } },
  vehicleSpeedMps: { label: '車速', unit: 'km/h', transform: (v) => (v * 3.6).toFixed(1) },
  acceleratorPedalPosition: { label: '油門', unit: '%', transform: (v) => (v * 100).toFixed(0) },
  steeringWheelAngle: { label: '方向盤', unit: '°', transform: (v) => v.toFixed(1) },
  blinkerOnLeft: { label: '左轉燈', unit: '', transform: (v) => v ? 'ON' : 'OFF' },
  blinkerOnRight: { label: '右轉燈', unit: '', transform: (v) => v ? 'ON' : 'OFF' },
  brakeApplied: { label: '煞車', unit: '', transform: (v) => v ? 'ON' : 'OFF' },
  autopilotState: { 
    label: '輔助駕駛', 
    unit: '', 
    enum: { 0: 'OFF', 1: 'FSD', 2: 'Autosteer', 3: 'TACC' } 
  },
  latitudeDeg: { label: '緯度', unit: '°', transform: (v) => v?.toFixed(6) },
  longitudeDeg: { label: '經度', unit: '°', transform: (v) => v?.toFixed(6) },
  headingDeg: { label: '航向', unit: '°', transform: (v) => v?.toFixed(1) },
  linearAccelerationMps2X: { label: '加速度 X', unit: 'm/s²', transform: (v) => v?.toFixed(2) },
  linearAccelerationMps2Y: { label: '加速度 Y', unit: 'm/s²', transform: (v) => v?.toFixed(2) },
  linearAccelerationMps2Z: { label: '加速度 Z', unit: 'm/s²', transform: (v) => v?.toFixed(2) },
};

// Protobuf 欄位名稱到 camelCase 的對應
const PROTO_TO_CAMEL = {
  gear_state: 'gearState',
  frame_seq_no: 'frameSeqNo',
  vehicle_speed_mps: 'vehicleSpeedMps',
  accelerator_pedal_position: 'acceleratorPedalPosition',
  steering_wheel_angle: 'steeringWheelAngle',
  blinker_on_left: 'blinkerOnLeft',
  blinker_on_right: 'blinkerOnRight',
  brake_applied: 'brakeApplied',
  autopilot_state: 'autopilotState',
  latitude_deg: 'latitudeDeg',
  longitude_deg: 'longitudeDeg',
  heading_deg: 'headingDeg',
  linear_acceleration_mps2_x: 'linearAccelerationMps2X',
  linear_acceleration_mps2_y: 'linearAccelerationMps2Y',
  linear_acceleration_mps2_z: 'linearAccelerationMps2Z',
};

/**
 * 簡易 Protobuf 解碼器 (不依賴外部庫)
 * 專門用於解析 Tesla SEI 元數據
 */
class SimpleProtobufDecoder {
  constructor(buffer) {
    this.buffer = buffer;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.pos = 0;
  }

  readVarint() {
    let result = 0;
    let shift = 0;
    while (this.pos < this.buffer.length) {
      const byte = this.buffer[this.pos++];
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  readFixed64() {
    const low = this.view.getUint32(this.pos, true);
    const high = this.view.getUint32(this.pos + 4, true);
    this.pos += 8;
    // 將 64 位整數轉為浮點數
    const dv = new DataView(new ArrayBuffer(8));
    dv.setUint32(0, low, true);
    dv.setUint32(4, high, true);
    return dv.getFloat64(0, true);
  }

  readFloat() {
    const value = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return value;
  }

  decode() {
    const result = {};
    
    while (this.pos < this.buffer.length) {
      try {
        const tag = this.readVarint();
        const fieldNumber = tag >> 3;
        const wireType = tag & 0x7;

        let value;
        switch (wireType) {
          case 0: // Varint
            value = this.readVarint();
            break;
          case 1: // 64-bit (double)
            value = this.readFixed64();
            break;
          case 5: // 32-bit (float)
            value = this.readFloat();
            break;
          case 2: // Length-delimited (skip)
            const len = this.readVarint();
            this.pos += len;
            continue;
          default:
            continue;
        }

        // 根據欄位號碼映射到屬性名稱
        const fieldMap = {
          1: 'version',
          2: 'gearState',
          3: 'frameSeqNo',
          4: 'vehicleSpeedMps',
          5: 'acceleratorPedalPosition',
          6: 'steeringWheelAngle',
          7: 'blinkerOnLeft',
          8: 'blinkerOnRight',
          9: 'brakeApplied',
          10: 'autopilotState',
          11: 'latitudeDeg',
          12: 'longitudeDeg',
          13: 'headingDeg',
          14: 'linearAccelerationMps2X',
          15: 'linearAccelerationMps2Y',
          16: 'linearAccelerationMps2Z',
        };

        const fieldName = fieldMap[fieldNumber];
        if (fieldName) {
          // 布林值處理
          if (['blinkerOnLeft', 'blinkerOnRight', 'brakeApplied'].includes(fieldName)) {
            result[fieldName] = value !== 0;
          } else {
            result[fieldName] = value;
          }
        }
      } catch (e) {
        break;
      }
    }

    return result;
  }
}

/**
 * 移除 H.264 防競爭位元組
 */
function stripEmulationBytes(data) {
  const out = [];
  let zeros = 0;
  for (const byte of data) {
    if (zeros >= 2 && byte === 0x03) {
      zeros = 0;
      continue;
    }
    out.push(byte);
    zeros = byte === 0 ? zeros + 1 : 0;
  }
  return Uint8Array.from(out);
}

/**
 * 從 NAL 單元中解碼 SEI 資料
 */
function decodeSeiFromNal(nal) {
  if (!nal || nal.length < 4) return null;

  // 尋找 Tesla SEI 標記 (0x42... 0x69)
  let i = 3;
  while (i < nal.length && nal[i] === 0x42) i++;
  if (i <= 3 || i + 1 >= nal.length || nal[i] !== 0x69) return null;

  try {
    const payload = stripEmulationBytes(nal.subarray(i + 1, nal.length - 1));
    const decoder = new SimpleProtobufDecoder(payload);
    return decoder.decode();
  } catch {
    return null;
  }
}

/**
 * 從 MP4 檔案中提取所有 SEI 訊息
 * @param {ArrayBuffer} buffer - MP4 檔案的 ArrayBuffer
 * @returns {Array} SEI 訊息陣列，每個元素對應一幀
 */
export async function extractSeiFromMp4(buffer) {
  const view = new DataView(buffer);
  const seiMessages = [];

  try {
    // 找到 mdat box
    let pos = 0;
    let mdatStart = 0;
    let mdatSize = 0;

    while (pos + 8 <= buffer.byteLength) {
      let size = view.getUint32(pos);
      const type = String.fromCharCode(
        view.getUint8(pos + 4),
        view.getUint8(pos + 5),
        view.getUint8(pos + 6),
        view.getUint8(pos + 7)
      );

      let headerSize = 8;
      if (size === 1) {
        // 64-bit size
        const high = view.getUint32(pos + 8);
        const low = view.getUint32(pos + 12);
        size = Number((BigInt(high) << 32n) | BigInt(low));
        headerSize = 16;
      } else if (size === 0) {
        size = buffer.byteLength - pos;
      }

      if (type === 'mdat') {
        mdatStart = pos + headerSize;
        mdatSize = size - headerSize;
        break;
      }

      pos += size;
    }

    if (mdatSize === 0) return seiMessages;

    // 解析 NAL 單元
    let cursor = mdatStart;
    const end = mdatStart + mdatSize;
    let frameIndex = 0;

    while (cursor + 4 <= end) {
      const nalSize = view.getUint32(cursor);
      cursor += 4;

      if (nalSize < 1 || cursor + nalSize > buffer.byteLength) break;

      const nalType = view.getUint8(cursor) & 0x1f;

      // NAL type 6 = SEI
      if (nalType === 6) {
        const nal = new Uint8Array(buffer.slice(cursor, cursor + nalSize));
        const sei = decodeSeiFromNal(nal);
        if (sei) {
          sei.frameIndex = frameIndex;
          seiMessages.push(sei);
        }
      }

      // NAL type 1 或 5 = 視訊幀
      if (nalType === 1 || nalType === 5) {
        frameIndex++;
      }

      cursor += nalSize;
    }
  } catch (e) {
    console.error('Error extracting SEI:', e);
  }

  return seiMessages;
}

/**
 * 根據影片時間取得對應的 SEI 資料
 * @param {Array} seiMessages - SEI 訊息陣列
 * @param {number} currentTime - 當前播放時間（秒）
 * @param {number} fps - 影片幀率（預設 36 fps，Tesla 標準）
 * @returns {Object|null} 當前時間點的 SEI 資料
 */
export function getSeiAtTime(seiMessages, currentTime, fps = 36) {
  if (!seiMessages || seiMessages.length === 0) return null;

  const targetFrame = Math.floor(currentTime * fps);
  
  // 找到最接近的 SEI 訊息
  let closest = null;
  let minDiff = Infinity;

  for (const sei of seiMessages) {
    const diff = Math.abs((sei.frameIndex || 0) - targetFrame);
    if (diff < minDiff) {
      minDiff = diff;
      closest = sei;
    }
  }

  // 如果差距超過 10 幀就回傳 null
  if (minDiff > 10) return null;

  return closest;
}

/**
 * 格式化 SEI 資料為顯示用物件
 * @param {Object} sei - SEI 原始資料
 * @returns {Object} 格式化後的資料
 */
export function formatSeiData(sei) {
  if (!sei) return null;

  const formatted = {};

  for (const [key, config] of Object.entries(SEI_FIELDS)) {
    const rawValue = sei[key];
    if (rawValue === undefined || rawValue === null) continue;

    let displayValue;
    if (config.enum) {
      displayValue = config.enum[rawValue] ?? rawValue;
    } else if (config.transform) {
      displayValue = config.transform(rawValue);
    } else {
      displayValue = rawValue;
    }

    formatted[key] = {
      label: config.label,
      value: displayValue,
      unit: config.unit,
      raw: rawValue,
    };
  }

  return formatted;
}

/**
 * 從 File 物件提取 SEI 資料
 * @param {File} file - 影片檔案
 * @returns {Promise<Array>} SEI 訊息陣列
 */
export async function extractSeiFromFile(file) {
  const buffer = await file.arrayBuffer();
  return extractSeiFromMp4(buffer);
}
