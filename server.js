const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const users = {};
const lastMessageTime = {};

function isValidUsername(name) {
    const regex = /^[a-zA-Z]{3,16}$/;
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
    console.log('[CONNECT] Socket ID:', socket.id);

    socket.on('join', (username, callback) => {
        if (!isValidUsername(username)) {
            callback({ success: false, error: 'Invalid Name' });
            return;
        }

        const isTaken = Object.values(users).some(
            u => u.toLowerCase() === username.toLowerCase()
        );

        if (isTaken) {
            callback({ success: false, error: 'Username taken' });
            return;
        }

        users[socket.id] = username;
        lastMessageTime[socket.id] = 0;
        console.log('[JOIN]', username);
        callback({ success: true });

        broadcastUserList();

        io.emit('chat message', {
            type: 'system',
            event: 'join',
            text: username + ' joined the chat'
        });
    });

    socket.on('chat message', (data) => {
        const username = users[socket.id];
        if (!username) return;

        const now = Date.now();
        if (lastMessageTime[socket.id] && now - lastMessageTime[socket.id] < 1000) {
            return;
        }
        lastMessageTime[socket.id] = now;

        let text = '';
        if (typeof data === 'object' && data !== null) {
            text = (data.text || '').substring(0, 500);
        } else if (typeof data === 'string') {
            text = data.substring(0, 500);
        }

        if (text.trim() !== '') {
            console.log('[MESSAGE]', username + ':', text);
            socket.broadcast.emit('chat message', {
                type: 'user',
                user: username,
                text: text,
                time: getTimestamp()
            });
        }
    });

    socket.on('disconnect', () => {
        const username = users[socket.id];
        if (username) {
            console.log('[LEAVE]', username);
            delete users[socket.id];
            delete lastMessageTime[socket.id];
            broadcastUserList();
            io.emit('chat message', {
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
