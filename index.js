const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set();

wss.on('connection', (ws) => {
    console.log('New client connected');
    clients.add(ws);

    // Initialize resources for this connection.
    let shell;
    let file_name;

    ws.on('message', (message) => {
        const { type, data, uid } = JSON.parse(message);
        file_name = uid;
        switch (type) {
            case 'runCommand':
                fs.writeFile(file_name + '.c', data, (err) => {
                    if (err) {
                        console.error('Error writing to ' + file_name + '.c:', err);
                        sendToClient(ws, JSON.stringify({ type: 'error', data: 'Error writing to ' + file_name + '.c' }));
                        return;
                    }

                    exec('gcc ' + file_name + '.c -o ' + file_name + '.o', (compileError, stdout, stderr) => {
                        if (compileError) {
                            console.error('Error compiling ' + file_name + '.c:', compileError);
                            sendToClient(ws, JSON.stringify({ type: 'error', data: stderr.trim() }));
                            cleanupFiles(file_name);
                            return;
                        }

                        shell = pty.spawn('./' + file_name + '.o', [], {
                            name: 'xterm-color',
                            cols: 80,
                            rows: 30,
                            cwd: './',
                            env: process.env
                        });

                        shell.onData(data => {
                            sendToClient(ws, JSON.stringify({ type: 'output', data }));
                        });

                        shell.onExit(() => {
                            cleanupFiles(file_name);
                        });
                    });
                });
                break;

            case 'sendInput':
                if (shell) {
                    shell.write(data + '\n');
                }
                break;

            default:
                break;
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
        if (shell) {
            shell.kill();
        }
    });
});

function sendToClient(client, message) {
    client.send(message);
}

function cleanupFiles(file_name) {
    exec('rm ' + file_name + '.c');
    exec('rm ' + file_name + '.o');
}

server.listen(3000, () => {
    console.log('Listening on *:3000');
});
