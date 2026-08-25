const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: false }
});

app.use(express.static('public'));

const users = {};
const messages = {};
const rateLimits = {};

function isValidUsername(name) {
    if (typeof name !== 'string') return false;
    const regex = /^[a-zA-Z0-9_]{3,16}$/;
    return regex.test(name);
}

function getTimestamp() {
    const d = new Date();
    const hrs = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return hrs + ':' + mins;
}

function broadcastUserList() {
    const list = Object.values(users);
    io.emit('user list update', list);
}

io.on('connection', (socket) => {
    rateLimits[socket.id] = { lastTime: 0, count: 0, resetTime: Date.now() };

    socket.on('join', (data, callback) => {
        if (typeof callback !== 'function') return;

        let username = '';
        if (typeof data === 'object' && data !== null) {
            username = String(data.name || '').trim();
        }

        if (!isValidUsername(username)) {
            callback({ success: false, error: 'Invalid Name' });
            return;
        }

        const isTaken = Object.values(users).some(
            u => u.name.toLowerCase() === username.toLowerCase()
        );

        if (isTaken) {
            callback({ success: false, error: 'Username taken' });
            return;
        }

        users[socket.id] = { name: username };
        callback({ success: true });

        broadcastUserList();

        io.emit('chat message', {
            id: 'sys_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            type: 'system',
            event: 'join',
            text: username + ' joined the chat'
        });
    });

    socket.on('chat message', (data) => {
        const userObj = users[socket.id];
        if (!userObj) return;

        const now = Date.now();
        const userRate = rateLimits[socket.id];
        
        if (now - userRate.lastTime < 700) return;
        if (now - userRate.resetTime > 10000) {
            userRate.count = 0;
            userRate.resetTime = now;
        }
        if (userRate.count >= 15) return;

        userRate.lastTime = now;
        userRate.count++;

        if (typeof data !== 'object' || data === null) return;

        const text = String(data.text || '').trim().substring(0, 500);
        if (text === '') return;

        const msgId = 'msg_' + now + '_' + Math.random().toString(36).substring(2, 7);
        
        let replyTo = null;
        if (data.replyTo && typeof data.replyTo === 'object') {
            replyTo = {
                user: String(data.replyTo.user || '').substring(0, 50),
                text: String(data.replyTo.text || '').substring(0, 200)
            };
        }

        const messageData = {
            id: msgId,
            type: 'user',
            user: userObj.name,
            text: text,
            time: getTimestamp()
        };

        if (replyTo) {
            messageData.replyTo = replyTo;
        }

        messages[msgId] = {
            ownerSocketId: socket.id,
            ownerName: userObj.name,
            text: text
        };

        io.emit('chat message', messageData);
    });

    socket.on('edit message', (data) => {
        const userObj = users[socket.id];
        if (!userObj || typeof data !== 'object' || data === null) return;

        const msgId = String(data.id || '');
        const newText = String(data.text || '').trim().substring(0, 500);

        if (newText === '') return;

        const existing = messages[msgId];
        if (existing && existing.ownerSocketId === socket.id && existing.ownerName === userObj.name) {
            existing.text = newText;
            io.emit('edit message', {
                id: msgId,
                text: newText
            });
        }
    });

    socket.on('delete message', (data) => {
        const userObj = users[socket.id];
        if (!userObj || typeof data !== 'object' || data === null) return;

        const msgId = String(data.id || '');
        const existing = messages[msgId];

        if (existing && existing.ownerSocketId === socket.id && existing.ownerName === userObj.name) {
            delete messages[msgId];
            io.emit('delete message', { id: msgId });
        }
    });

    socket.on('ping test', (callback) => {
        if (typeof callback === 'function') callback();
    });

    socket.on('disconnect', () => {
        const userObj = users[socket.id];
        if (userObj) {
            const username = userObj.name;
            delete users[socket.id];
            delete rateLimits[socket.id];
            broadcastUserList();
            io.emit('chat message', {
                id: 'sys_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                type: 'system',
                event: 'leave',
                text: username + ' left the chat'
            });
        }
    });
});

server.listen(3000, () => {
    console.log('Server listening on port 3000');
});
