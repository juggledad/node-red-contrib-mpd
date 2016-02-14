/**
 * Copyright 2015 Danny Drie�, cinhcet@gmail.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/
 
module.exports = function(RED) {
    "use strict";
    var mpd = require('mpd');
    var events = require('events');
     
   
    //The connections to multiple mpd servers are stored here.
    var connections = {}; 
    
    //The configuration node for the mpd server
    function MpdServerNode(n) {
        RED.nodes.createNode(this,n);
        
        var node = this;
        node.host = n.host;
        node.port = n.port;
        node.connected = false;
        
        node.eventEmitter = new events.EventEmitter();
    
        connectToMPD(node);
    }
    RED.nodes.registerType("mpd-server",MpdServerNode);

    MpdServerNode.prototype.close = function() {
        this.client.socket.destroy();
        this.disconnect();
    }

    MpdServerNode.prototype.disconnect = function() {
        var id = this.getID()
        if(connections[id] != null) {
            connections[id].instances -= 1;
            if(connections[id].instances == 0) {
                connections[id].socket.destroy();
                delete connections[id];
            }
        }
    }

    MpdServerNode.prototype.getID = function() {
        return "[" + this.host + ":" + this.port + "]";
    }

    function connectToMPD(node) {
        var id = node.getID();
        if(typeof connections[id] == "undefined" || connections[id] == null) {
            connections[id] = mpd.connect({port: node.port, host: node.host});
            var connection = connections[id];
            connection.instances = 0;
            
            connection.on('error', function(err) { 
                node.log('Error: Connetcion problem? Is the mpd-server '  + node.host + ':' + node.port + ' running? \n Error code: ' + err);
            });
            connection.on('ready', function() {
                node.log('Connected to MPD server ' + node.host + ':' + node.port);
                node.connected = true;
                node.eventEmitter.emit('connected');
            });
            connection.on('end', function() {
                node.log('Disconnected to MPD server '  + node.host + ':' + node.port);
                node.connected = false;
                node.eventEmitter.emit('disconnected');
                setTimeout(function() {
                    node.disconnect();
                    connectToMPD(node);
                }, 1000);
            });
        }
        connections[id].instances += 1;
        node.client = connections[id];
    }
    
    
    
    //MPD out Node
    function MpdOutNode(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        node.topic = n.topic;
        node.server = RED.nodes.getNode(n.server);
        node.status({fill:"red",shape:"ring",text:"not connected"});
        
        node.on('input', function (msg) {
            if(node.server.connected) {
                var options = [];
                if(msg.options) {
                    options = msg.options;
                }
                node.server.client.sendCommand(mpd.cmd(msg.payload, options), function(err, msg) {
                    if(err) {
                        node.log('[MPD] - ' + err);
                        return;
                    }
                    var message = {};
                    message.payload = mpd.parseArrayMessage(msg);
                    message.topic = node.topic;
                    if(message.payload) {
                        node.send(message);
                    }
                });
            }
        });
        
        node.server.eventEmitter.on('connected', function() {
            node.status({fill:"green",shape:"dot",text:"connected"});
        });
        node.server.eventEmitter.on('disconnected', function() {
            node.status({fill:"red",shape:"ring",text:"not connected"});
        });
        node.on("close", function() {
            node.server.disconnect();
        });
    }
    RED.nodes.registerType("mpd out",MpdOutNode);
    
    
    
    //Mpd in node
    function MpdInNode(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        node.topic = n.topic;
        node.server = RED.nodes.getNode(n.server);
        node.status({fill:"red",shape:"ring",text:"not connected"});
        node.server.eventEmitter.on('connected', function() {
            node.server.client.on('system', function(name) {
                var msg = {};
                msg.topic = node.topic;
                msg.payload = {};
                node.server.client.sendCommand(mpd.cmd("currentsong", []), function(err, message) {
                     if(err) {
                        node.log('[MPD] - Error: ' + err);
                    }
                    msg.payload.currentsong = mpd.parseKeyValueMessage(message);
                    node.server.client.sendCommand(mpd.cmd('status', []), function(err, message) {
                        if(err) {
                            node.log('[MPD] - Error: ' + err);
                        }
                        msg.payload.status = mpd.parseKeyValueMessage(message);
                        node.send(msg);
                    });
                });
            });
	    node.status({fill:"green",shape:"dot",text:"connected"});
	});
        node.server.eventEmitter.on('disconnected', function() {
            node.status({fill:"red",shape:"ring",text:"not connected"});
        });
        node.on("close", function() {
            node.server.disconnect();
        });
    }
    RED.nodes.registerType("mpd in",MpdInNode);
    
    
}
