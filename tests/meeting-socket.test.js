import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { io as ioClient } from 'socket.io-client';
import { buildApp } from '../src/app.js';
import { User } from '../src/modules/users/user.model.js';
import { Meeting } from '../src/modules/meetings/meeting.model.js';
import { generateAccessToken } from '../src/utils/tokens.js';

describe('Meeting Socket.IO Real-Time & WebRTC Signaling Tests', () => {
  let app;
  let serverAddress;
  let hostUser, hostToken;
  let peerUser, peerToken;
  let testMeeting;
  let activeSockets = [];

  function waitForEvent(socket, event, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for socket event "${event}" after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  async function createTestUser(name, email) {
    const user = await User.create({
      name,
      email,
      normalizedEmail: email.toLowerCase().trim(),
      passwordHash: '$2a$12$e8v1N8r4M.1HjZ5i2cM0tuxJ6lP9k7o3t.7Q8z5w2r0b4v6e8h9iO',
      isActive: true,
      isEmailVerified: true
    });
    const token = generateAccessToken({
      userId: user._id.toString(),
      email: user.normalizedEmail,
      role: user.role
    });
    return { user, token };
  }

  function createSocket(token, opts = {}) {
    const socket = ioClient(serverAddress, {
      transports: ['websocket'],
      reconnection: false,
      auth: token ? { token } : undefined,
      ...opts
    });
    activeSockets.push(socket);
    return socket;
  }

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    serverAddress = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const socket of activeSockets) {
      if (socket.connected) socket.disconnect();
    }
    activeSockets = [];
    if (app) await app.close();
  });

  beforeEach(async () => {
    const host = await createTestUser('Alice Host', 'meeting.host.socket@example.com');
    hostUser = host.user;
    hostToken = host.token;

    const peer = await createTestUser('Bob Peer', 'meeting.peer.socket@example.com');
    peerUser = peer.user;
    peerToken = peer.token;

    testMeeting = await Meeting.create({
      meetingCode: 'itm-111-222',
      title: 'Real-Time Signaling Sync',
      organizerId: hostUser._id,
      status: 'live'
    });
  });

  afterEach(() => {
    for (const socket of activeSockets) {
      if (socket.connected) socket.disconnect();
    }
    activeSockets = [];
  });

  describe('Meeting Room Membership & Presence', () => {
    it('should join meeting room and acknowledge with peers list', async () => {
      const socket = createSocket(hostToken);
      await waitForEvent(socket, 'connect');

      const joinPromise = new Promise((resolve) => {
        socket.emit('meeting:join', { meetingId: testMeeting._id.toString() }, (res) => {
          resolve(res);
        });
      });

      const ack = await joinPromise;
      expect(ack.success).toBe(true);
      expect(ack.meetingId).toBe(testMeeting._id.toString());
      expect(ack.isHost).toBe(true);
      expect(Array.isArray(ack.peers)).toBe(true);
    });

    it('should notify existing participants when a new peer joins', async () => {
      const socketHost = createSocket(hostToken);
      await waitForEvent(socketHost, 'connect');
      await new Promise((resolve) => {
        socketHost.emit('meeting:join', { meetingId: testMeeting._id.toString() }, resolve);
      });

      const socketPeer = createSocket(peerToken);
      await waitForEvent(socketPeer, 'connect');

      const joinedEventPromise = waitForEvent(socketHost, 'meeting:participant:joined');
      socketPeer.emit('meeting:join', { meetingId: testMeeting._id.toString() });

      const joinedData = await joinedEventPromise;
      expect(joinedData.participant.userId).toBe(peerUser._id.toString());
      expect(joinedData.participant.socketId).toBe(socketPeer.id);
    });
  });

  describe('WebRTC Signaling Exchange', () => {
    it('should relay WebRTC offer, answer, and ICE candidate between peers', async () => {
      const socketHost = createSocket(hostToken);
      const socketPeer = createSocket(peerToken);
      await Promise.all([waitForEvent(socketHost, 'connect'), waitForEvent(socketPeer, 'connect')]);

      // Host joins
      await new Promise((resolve) => {
        socketHost.emit('meeting:join', { meetingId: testMeeting._id.toString() }, resolve);
      });

      // Peer joins
      const peerJoinAck = await new Promise((resolve) => {
        socketPeer.emit('meeting:join', { meetingId: testMeeting._id.toString() }, resolve);
      });

      expect(peerJoinAck.peers.length).toBeGreaterThanOrEqual(1);
      const hostSocketId = socketHost.id;
      const peerSocketId = socketPeer.id;

      // 1. Peer sends SDP offer to Host
      const offerData = { type: 'offer', sdp: 'v=0\r\no=alice 12345 12345 IN IP4 127.0.0.1...' };
      const offerEventPromise = waitForEvent(socketHost, 'meeting:signal:offer');

      socketPeer.emit('meeting:signal:offer', {
        meetingId: testMeeting._id.toString(),
        targetSocketId: hostSocketId,
        offer: offerData
      });

      const receivedOffer = await offerEventPromise;
      expect(receivedOffer.senderSocketId).toBe(peerSocketId);
      expect(receivedOffer.offer.sdp).toBe(offerData.sdp);

      // 2. Host sends SDP answer to Peer
      const answerData = { type: 'answer', sdp: 'v=0\r\no=bob 67890 67890 IN IP4 127.0.0.1...' };
      const answerEventPromise = waitForEvent(socketPeer, 'meeting:signal:answer');

      socketHost.emit('meeting:signal:answer', {
        meetingId: testMeeting._id.toString(),
        targetSocketId: peerSocketId,
        answer: answerData
      });

      const receivedAnswer = await answerEventPromise;
      expect(receivedAnswer.senderSocketId).toBe(hostSocketId);
      expect(receivedAnswer.answer.sdp).toBe(answerData.sdp);

      // 3. ICE Candidate exchange
      const candidateData = { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
      const candidateEventPromise = waitForEvent(socketPeer, 'meeting:signal:ice-candidate');

      socketHost.emit('meeting:signal:ice-candidate', {
        meetingId: testMeeting._id.toString(),
        targetSocketId: peerSocketId,
        candidate: candidateData
      });

      const receivedCandidate = await candidateEventPromise;
      expect(receivedCandidate.senderSocketId).toBe(hostSocketId);
      expect(receivedCandidate.candidate.candidate).toBe(candidateData.candidate);
    });
  });

  describe('Live In-Meeting Chat over Socket.IO', () => {
    it('should persist chat message and broadcast to room with acknowledgment', async () => {
      const socketHost = createSocket(hostToken);
      const socketPeer = createSocket(peerToken);
      await Promise.all([waitForEvent(socketHost, 'connect'), waitForEvent(socketPeer, 'connect')]);

      await Promise.all([
        new Promise((res) => socketHost.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res)),
        new Promise((res) => socketPeer.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res))
      ]);

      const newMsgPromise = waitForEvent(socketPeer, 'meeting:chat:new');

      const ackPromise = new Promise((resolve) => {
        socketHost.emit(
          'meeting:chat:send',
          {
            meetingId: testMeeting._id.toString(),
            content: 'Real-time message delivered via Socket.IO room broadcast',
            clientMessageId: 'test-cl-sock-1'
          },
          resolve
        );
      });

      const [ack, broadcasted] = await Promise.all([ackPromise, newMsgPromise]);
      expect(ack.success).toBe(true);
      expect(ack.message.content).toBe('Real-time message delivered via Socket.IO room broadcast');
      expect(broadcasted.message.content).toBe('Real-time message delivered via Socket.IO room broadcast');
      expect(broadcasted.message.sender.name).toBe('Alice Host');
    });

    it('should broadcast media state updates to room peers', async () => {
      const socketHost = createSocket(hostToken);
      const socketPeer = createSocket(peerToken);
      await Promise.all([waitForEvent(socketHost, 'connect'), waitForEvent(socketPeer, 'connect')]);

      await Promise.all([
        new Promise((res) => socketHost.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res)),
        new Promise((res) => socketPeer.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res))
      ]);

      const mediaUpdatePromise = waitForEvent(socketPeer, 'meeting:media:update');

      socketHost.emit('meeting:media:state', {
        meetingId: testMeeting._id.toString(),
        isAudioMuted: false,
        isVideoOn: true,
        isScreenSharing: true,
        isHandRaised: false
      });

      const mediaUpdate = await mediaUpdatePromise;
      expect(mediaUpdate.isAudioMuted).toBe(false);
      expect(mediaUpdate.isVideoOn).toBe(true);
      expect(mediaUpdate.isScreenSharing).toBe(true);
      expect(mediaUpdate.userId).toBe(hostUser._id.toString());
    });
  });

  describe('Meeting Lifecycle & Disconnect Notification', () => {
    it('should notify room when host ends the meeting', async () => {
      const socketHost = createSocket(hostToken);
      const socketPeer = createSocket(peerToken);
      await Promise.all([waitForEvent(socketHost, 'connect'), waitForEvent(socketPeer, 'connect')]);

      await Promise.all([
        new Promise((res) => socketHost.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res)),
        new Promise((res) => socketPeer.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res))
      ]);

      const endedPromise = waitForEvent(socketPeer, 'meeting:ended');

      socketHost.emit('meeting:end', { meetingId: testMeeting._id.toString() });

      const endedData = await endedPromise;
      expect(endedData.meetingId).toBe(testMeeting._id.toString());
    });

    it('should broadcast participant left when socket disconnects', async () => {
      const socketHost = createSocket(hostToken);
      const socketPeer = createSocket(peerToken);
      await Promise.all([waitForEvent(socketHost, 'connect'), waitForEvent(socketPeer, 'connect')]);

      await Promise.all([
        new Promise((res) => socketHost.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res)),
        new Promise((res) => socketPeer.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res))
      ]);

      const leftPromise = waitForEvent(socketHost, 'meeting:participant:left');

      socketPeer.disconnect();

      const leftData = await leftPromise;
      expect(leftData.userId).toBe(peerUser._id.toString());
    });

    it('should broadcast participant muted and removed events when host executes moderation', async () => {
      const socketHost = createSocket(hostToken);
      const socketPeer = createSocket(peerToken);
      await Promise.all([waitForEvent(socketHost, 'connect'), waitForEvent(socketPeer, 'connect')]);

      await Promise.all([
        new Promise((res) => socketHost.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res)),
        new Promise((res) => socketPeer.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res))
      ]);

      // Host mutes peer
      const mutePromise = waitForEvent(socketPeer, 'meeting:participant:muted');
      socketHost.emit('meeting:participant:mute', {
        meetingId: testMeeting._id.toString(),
        targetUserId: peerUser._id.toString()
      });
      const muteData = await mutePromise;
      expect(muteData.userId).toBe(peerUser._id.toString());

      // Host kicks peer
      const removePromise = waitForEvent(socketPeer, 'meeting:participant:removed');
      socketHost.emit('meeting:participant:remove', {
        meetingId: testMeeting._id.toString(),
        targetUserId: peerUser._id.toString()
      });
      const removeData = await removePromise;
      expect(removeData.userId).toBe(peerUser._id.toString());
    });

    it('should maintain strict room isolation between different meetings', async () => {
      const otherMeeting = await Meeting.create({
        meetingCode: 'itm-333-444',
        title: 'Completely Different Meeting',
        organizerId: hostUser._id,
        status: 'live'
      });

      const socketHostMeeting1 = createSocket(hostToken);
      const socketPeerMeeting2 = createSocket(peerToken);
      await Promise.all([waitForEvent(socketHostMeeting1, 'connect'), waitForEvent(socketPeerMeeting2, 'connect')]);

      // Host joins meeting 1
      await new Promise((res) => socketHostMeeting1.emit('meeting:join', { meetingId: testMeeting._id.toString() }, res));
      // Peer joins meeting 2
      await new Promise((res) => socketPeerMeeting2.emit('meeting:join', { meetingId: otherMeeting._id.toString() }, res));

      let leakedMessage = null;
      socketPeerMeeting2.on('meeting:chat:new', (msg) => {
        leakedMessage = msg;
      });

      // Host chats in meeting 1
      await new Promise((res) =>
        socketHostMeeting1.emit(
          'meeting:chat:send',
          {
            meetingId: testMeeting._id.toString(),
            content: 'Meeting 1 confidential chatter'
          },
          res
        )
      );

      // Give event loop time to verify peer in meeting 2 never receives it
      await new Promise((r) => setTimeout(r, 150));
      expect(leakedMessage).toBeNull();
    });
  });
});
