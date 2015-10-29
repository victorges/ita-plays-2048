var events = require('events');
var core   = require('./core2048.js');

var SocketInputManager = function(io) {
  this.io = io;
  this.eventEmitter = new events.EventEmitter();
  this.clientsMap = new Map();
  this.usernames = new Set();

  this.listen(io);
}

SocketInputManager.prototype.on = function(evt, callback) {
  this.eventEmitter.on(evt, callback);
}

SocketInputManager.prototype.listen = function(io) {
  var self = this;
  io.on('connection', function(socket) {
    self.clientsMap.set(socket.id, self.randomUsername());

    socket.on('move', function(data) {
      self.onMove(socket, data);
    });
    socket.on('keepPlaying', function() {
      self.eventEmitter.emit('keepPlaying');
      self.io.emit('keepPlaying');
    });
    socket.on('restart', function() {
      self.eventEmitter.emit('restart');
    });
    socket.on('chatMessage', function(data){
      self.onChatMessage(socket, data);
    });
    socket.on('disconnect', function(){
      self.usernames.delete(self.clientsMap.get(socket.id));
      self.clientsMap.delete(socket.id);
    });
  });
};

SocketInputManager.prototype.changeUsername = function(socket, newUsername) {
  this.usernames.delete(this.clientsMap.get(socket.id));
  this.usernames.add(newUsername);
  this.clientsMap.set(socket.id, newUsername);
}

SocketInputManager.prototype.randomUsername = function() {
  var max = 2 * this.clientsMap.size;
  do {
    var id = Math.round(Math.random() * max);
    var username = "guest_" + id;
  } while (this.usernames.has(username));

  this.usernames.add(username);
  return username;
}

SocketInputManager.prototype.onMove = function(socket, data) {
  var directions = [core.Direction.UP, core.Direction.LEFT, core.Direction.DOWN, core.Direction.RIGHT];
  var dir = JSON.parse(data);
  if (directions.indexOf(dir) > -1) {
    this.eventEmitter.emit('move', dir);
    var msg = null;
    switch (dir) {
      case core.Direction.UP:
        msg = "UP";
        break;
      case core.Direction.LEFT:
        msg = "LEFT";
        break;
      case core.Direction.DOWN:
        msg = "DOWN";
        break;
      case core.Direction.RIGHT:
        msg = "RIGHT";
        break;
    }
    if (msg) {
      var data = {
        msg: msg,
        username: this.clientsMap.get(socket.id),
      }
      this.io.emit('chatMessage', JSON.stringify(data));
    }
  }
};

SocketInputManager.prototype.onChatMessage = function(socket, msg) {
  
  //check if the message is a move command
  switch (msg.toLowerCase()) {
    case "up":
      this.eventEmitter.emit('move', core.Direction.UP);
      break;
    case "left":
      this.eventEmitter.emit('move', core.Direction.LEFT);
      break;
    case "down":
      this.eventEmitter.emit('move', core.Direction.DOWN);
      break;
    case "right":
      this.eventEmitter.emit('move', core.Direction.RIGHT);
      break;
  }

  //if message is in the format "nick new_username" to change username 
  if(msg.toLowerCase().indexOf("nick") === 0) { //begins with nick
    var strArray = msg.split(" ");
    if (strArray.length === 2) {
      var newUsername = strArray[1];
      var data = {
        msg: this.clientsMap.get(socket.id) + " changed username to " + newUsername,
      };
      this.changeUsername(socket, newUsername);
      this.io.emit('chatMessage', JSON.stringify(data));
    }
    
  } else {
    var data = {
      msg: msg,
      username: this.clientsMap.get(socket.id),
    };
    this.eventEmitter.emit('chatMessage', JSON.stringify(data));  
  } 
};

var MemoryStorageManager = function(io) {
  this.gameState = null;
  this.bestScore = 0;
  this.io = io;

  this.listen(io);
};

MemoryStorageManager.prototype = {
  getBestScore: function() {return this.bestScore;},
  setBestScore: function(score) {this.bestScore = score;},
  getGameState: function() {return this.gameState;},
  clearGameState: function() {this.gameState = null;}
};

MemoryStorageManager.prototype.listen = function(io) {
  var self = this;
  io.on('connection', function(socket) {
    socket.emit('gameState', JSON.stringify(self.gameState));
    socket.emit('bestScore', JSON.stringify(self.bestScore));
  });
};

MemoryStorageManager.prototype.setGameState = function(state) {
  if (this.gameState == null) {
    // this means the state has just been cleared, this will happen when the
    // game is restarted so broadcast the randomized initial state of the game
    this.io.emit('restart', JSON.stringify(state));
  }
  this.gameState = state;
};

var Actuator = function(io) {
  this.io = io;
}

Actuator.prototype.actuate = function(grid, metadata) {
  if (metadata.direction != null) {
    var data = {
        dir: metadata.direction,
        tile: metadata.addedTile.serialize()
      };
    this.io.emit('move', JSON.stringify(data));
  }
}

Actuator.prototype.continueGame = function(){}

Actuator.prototype.addChatMessage = function(data) {
  this.io.emit("chatMessage", data);
}

module.exports = function(http) {
  var io = require('socket.io')(http);

  return {
    inputManager: SocketInputManager.bind(null, io),
    storageManager: MemoryStorageManager.bind(null, io),
    actuator: Actuator.bind(null, io)
  };
}