const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const pty = require('node-pty');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let shell;

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', (message) => {
        const { type, data, uid } = JSON.parse(message);
        switch (type) {
            case 'runCommand':
                fs.writeFile(uid+'.c', data, (err) => {
                    if (err) {
                        console.error('Error writing to '+uid+'.c:', err);
                        ws.send(JSON.stringify({ type: 'error', data: 'Error writing to '+uid+'.c' }));
                        return;
                    }

                    exec('gcc '+uid+'.c -o output.o', (compileError) => {
                        if (compileError) {
                            console.error('Error compiling '+uid+'.c:', compileError);
                            ws.send(JSON.stringify({ type: 'error', data: 'Error compiling '+uid+'.c' }));
                            return;
                        }

                        // Compilation successful, now execute the program
                        shell = pty.spawn('./output.o', [], {
                            name: 'xterm-color',
                            cols: 80,
                            rows: 30,
                            cwd: './',
                            env: process.env
                        });

                        shell.onData(data => {
                            ws.send(JSON.stringify({ type: 'output', data }));
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
        if (shell) {
            shell.kill();
        }
    });
});

server.listen(3000, () => {
    console.log('Listening on *:3000');
});
