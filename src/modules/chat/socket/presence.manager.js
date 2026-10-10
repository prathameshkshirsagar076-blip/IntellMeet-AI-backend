class PresenceManager {
  constructor() {
    // Map<userId string, Set<socketId string>>
    this.userSockets = new Map();
    // Map<userId string, Date>
    this.lastSeenMap = new Map();
  }

  addSocket(userId, socketId) {
    const uid = String(userId);
    let socketSet = this.userSockets.get(uid);
    const isNewlyOnline = !socketSet || socketSet.size === 0;

    if (!socketSet) {
      socketSet = new Set();
      this.userSockets.set(uid, socketSet);
    }

    socketSet.add(socketId);
    return {
      isNewlyOnline,
      activeSocketsCount: socketSet.size
    };
  }

  removeSocket(userId, socketId) {
    const uid = String(userId);
    const socketSet = this.userSockets.get(uid);

    if (!socketSet) {
      return { isNowOffline: false, remainingSocketsCount: 0 };
    }

    socketSet.delete(socketId);
    const isNowOffline = socketSet.size === 0;

    if (isNowOffline) {
      this.userSockets.delete(uid);
      this.lastSeenMap.set(uid, new Date());
    }

    return {
      isNowOffline,
      remainingSocketsCount: isNowOffline ? 0 : socketSet.size
    };
  }

  isOnline(userId) {
    const uid = String(userId);
    const socketSet = this.userSockets.get(uid);
    return Boolean(socketSet && socketSet.size > 0);
  }

  getLastSeen(userId) {
    const uid = String(userId);
    return this.lastSeenMap.get(uid) || null;
  }

  getUserSockets(userId) {
    const uid = String(userId);
    const socketSet = this.userSockets.get(uid);
    return socketSet ? Array.from(socketSet) : [];
  }

  clear() {
    this.userSockets.clear();
    this.lastSeenMap.clear();
  }
}

export const presenceManager = new PresenceManager();
