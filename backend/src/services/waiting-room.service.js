/**
 * Virtual Waiting Room Service
 * File: backend/src/services/waiting-room.service.js
 *
 * Implements FIFO Virtual Waiting Room, queue position and estimated wait time (Phân hệ 2.7).
 */

class WaitingRoomService {
  constructor() {
    // Structure: eventId -> Array<{ sessionId, joinedAt, admittedAt, token }>
    this.queues = new Map();
    // High-traffic events configuration: eventId -> { maxConcurrent: number, admissionRatePerMin: number }
    this.highTrafficConfigs = new Map();
  }

  /**
   * Configure high-traffic waiting room for an event
   */
  configureWaitingRoom(eventId, { enabled = true, maxConcurrent = 50, admissionRatePerMin = 30 } = {}) {
    const numEventId = Number(eventId);
    if (!enabled) {
      this.highTrafficConfigs.delete(numEventId);
      this.queues.delete(numEventId);
      return { enabled: false };
    }

    this.highTrafficConfigs.set(numEventId, {
      enabled: true,
      maxConcurrent,
      admissionRatePerMin,
    });

    if (!this.queues.has(numEventId)) {
      this.queues.set(numEventId, []);
    }

    return { enabled: true, maxConcurrent, admissionRatePerMin };
  }

  activateWaitingRoom(eventId, options = {}) {
    return this.configureWaitingRoom(eventId, { enabled: true, ...options });
  }

  /**
   * Check if event requires waiting room
   */
  isWaitingRoomActive(eventId) {
    const numEventId = Number(eventId);
    return this.highTrafficConfigs.has(numEventId);
  }

  isQueueActive(eventId) {
    return this.isWaitingRoomActive(eventId);
  }

  /**
   * Join or check status in the virtual queue
   */
  joinOrCheckQueue(eventId, sessionId) {
    const numEventId = Number(eventId);
    if (!sessionId) {
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    if (!this.highTrafficConfigs.has(numEventId)) {
      // Waiting room not needed, direct pass
      return {
        is_queued: false,
        admitted: true,
        admission_token: `TOKEN_PASS_${numEventId}_${sessionId}`,
        position: 0,
        estimated_wait_seconds: 0,
        message: 'Bạn có thể vào luồng đặt vé ngay',
      };
    }

    const config = this.highTrafficConfigs.get(numEventId);
    if (!this.queues.has(numEventId)) {
      this.queues.set(numEventId, []);
    }
    const queue = this.queues.get(numEventId);

    // Clean up expired admitted sessions (> 15 mins)
    const now = Date.now();
    const activeQueue = queue.filter((item) => {
      if (item.admitted && now - item.admittedAt > 15 * 60 * 1000) {
        return false;
      }
      return true;
    });
    this.queues.set(numEventId, activeQueue);

    // Check if session is already in queue
    let entry = activeQueue.find((i) => i.sessionId === sessionId);
    if (!entry) {
      entry = {
        sessionId,
        joinedAt: now,
        admitted: false,
        admittedAt: null,
        token: null,
      };
      activeQueue.push(entry);
    }

    // Strict FIFO Queue Admission (TF-P1-09)
    const admittedCount = activeQueue.filter((i) => i.admitted).length;
    const availableSlots = Math.max(0, config.maxConcurrent - admittedCount);

    if (availableSlots > 0) {
      const waitingSorted = activeQueue
        .filter((i) => !i.admitted)
        .sort((a, b) => a.joinedAt - b.joinedAt);

      const toAdmit = waitingSorted.slice(0, availableSlots);
      for (const item of toAdmit) {
        item.admitted = true;
        item.admittedAt = now;
        item.token = `TOKEN_ADMIT_${numEventId}_${item.sessionId}_${Date.now()}`;
      }
    }

    if (entry.admitted) {
      return {
        is_queued: false,
        admitted: true,
        sessionId,
        admission_token: entry.token,
        position: 0,
        estimated_wait_seconds: 0,
        message: 'Đã đến lượt của bạn! Bạn có 15 phút để hoàn tất chọn vé và thanh toán.',
      };
    }

    // Still in queue: calculate position and wait time
    const waitingQueue = activeQueue.filter((i) => !i.admitted);
    const position = waitingQueue.findIndex((i) => i.sessionId === sessionId) + 1;
    const ratePerSecond = config.admissionRatePerMin / 60;
    const estimatedWaitSeconds = Math.max(5, Math.ceil(position / (ratePerSecond || 0.5)));

    return {
      is_queued: true,
      admitted: false,
      sessionId,
      position,
      total_in_queue: waitingQueue.length,
      estimated_wait_seconds: estimatedWaitSeconds,
      message: `Bạn đang ở vị trí thứ ${position} trong hàng đợi ảo. Vui lòng giữ nguyên màn hình.`,
    };
  }

  /**
   * Verify admission token before booking
   */
  verifyAdmissionToken(eventId, token) {
    const numEventId = Number(eventId);
    if (!this.highTrafficConfigs.has(numEventId)) {
      return true;
    }
    if (!token) return false;
    const queue = this.queues.get(numEventId) || [];
    const entry = queue.find((i) => i.token === token && i.admitted);
    if (!entry) return false;
    if (entry.consumed) return false; // Token already consumed for an order
    // Check 15m expiration
    return Date.now() - entry.admittedAt <= 15 * 60 * 1000;
  }

  /**
   * Consume admission token upon successful order reservation
   */
  consumeAdmissionToken(eventId, token) {
    const numEventId = Number(eventId);
    if (!this.highTrafficConfigs.has(numEventId) || !token) {
      return true;
    }
    const queue = this.queues.get(numEventId) || [];
    const entry = queue.find((i) => i.token === token && i.admitted);
    if (entry) {
      entry.consumed = true;
      entry.consumedAt = Date.now();
      return true;
    }
    return false;
  }
}

export default new WaitingRoomService();
